// Command seed loads seed/menu.json into Postgres and creates staff accounts.
//
//	go run ./cmd/seed -menu ../seed/menu.json
//	STAFF_PASSWORD='...' go run ./cmd/seed -add-staff -email you@example.com -name Vikash -role admin
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/vikash-parashar/urban-bites/api/internal/auth"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

var temporary *bool

func main() {
	menuPath := flag.String("menu", "", "path to menu.json to load")
	addStaff := flag.Bool("add-staff", false, "create or reset a staff account (password from STAFF_PASSWORD)")
	email := flag.String("email", "", "staff email")
	name := flag.String("name", "", "staff display name")
	role := flag.String("role", "owner", "admin or owner")
	temporary = flag.Bool("temporary", false, "with -add-staff: the password is temporary and must be changed at first sign-in")
	flag.Parse()

	ctx := context.Background()
	st, err := store.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer st.Close()
	if err := st.Migrate(ctx); err != nil {
		log.Fatal(err)
	}

	if *menuPath != "" {
		if err := seedMenu(ctx, st, *menuPath); err != nil {
			log.Fatal(err)
		}
	}
	if *addStaff {
		if err := upsertStaff(ctx, st, *email, *name, *role, os.Getenv("STAFF_PASSWORD")); err != nil {
			log.Fatal(err)
		}
	}
	if *menuPath == "" && !*addStaff {
		flag.Usage()
	}
}

func seedMenu(ctx context.Context, st *store.Store, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var menu struct {
		Categories []store.Category `json:"categories"`
	}
	if err := json.Unmarshal(raw, &menu); err != nil {
		return err
	}
	n := 0
	for i, c := range menu.Categories {
		if err := st.SeedCategory(ctx, i, c); err != nil {
			return fmt.Errorf("seed %s: %w", c.ID, err)
		}
		n += len(c.Items)
	}
	fmt.Printf("seeded %d categories, %d items\n", len(menu.Categories), n)
	return nil
}

func upsertStaff(ctx context.Context, st *store.Store, email, name, role, password string) error {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("STAFF_PASSWORD: %w", err)
	}
	existing, err := st.UserByEmail(ctx, email)
	if errors.Is(err, store.ErrNotFound) {
		u, err := st.CreateUser(ctx, email, name, role, hash, *temporary)
		if err != nil {
			return err
		}
		fmt.Printf("created %s %s (%s)\n", u.Role, u.Name, u.Email)
		return nil
	} else if err != nil {
		return err
	}
	active := true
	u, err := st.UpdateUser(ctx, existing.ID, store.UserUpdate{Name: &name, Role: &role, Active: &active, PasswordHash: &hash, MustChange: *temporary})
	if err != nil {
		return err
	}
	fmt.Printf("updated %s %s (%s), password reset\n", u.Role, u.Name, u.Email)
	return nil
}
