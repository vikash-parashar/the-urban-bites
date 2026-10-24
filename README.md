# The Urban Bites

| Folder | What it is |
|---|---|
| `web/` | Website: animated homepage, menu, cart, checkout, live order tracker, and a staff area at `/#staff` (Vite + React + GSAP). Builds to static files. |
| `api/` | Go + Postgres API shared by the website and the Android app. Runs locally or on AWS Lambda. |
| `app/` | Flutter Android app: customers order and track; staff manage orders, menu, earnings (and staff, for the admin). See `app/README.md`. |
| `seed/menu.json` | Menu transcribed from the cart's board. `null` price = not orderable until set. `_check` = confirm with the owner. |

## Roles

- **Customer**: no account. Orders on the website or app and tracks it with a private link token.
- **Owner** (Manjeet): orders, prep times, menu prices/availability, earnings.
- **Admin** (Vikash, gowithvikash@gmail.com): everything the owner can do, plus add, disable and reset staff accounts.

Both staff roles sign in with email + password on the website (`/#staff`) or in the app ("Staff sign in").

## Run locally

```sh
docker compose up -d
docker compose run --rm -v ./seed:/seed api-seed -menu /seed/menu.json
docker compose run --rm -e STAFF_PASSWORD='choose-a-long-one' api-seed -add-staff -email gowithvikash@gmail.com -name Vikash -role admin
cd web && npm install && VITE_API_URL=http://localhost:8080 npm run dev
```

After the first admin exists, add Manjeet from the Staff tab (website or app).

## API

Customer:
- `GET /v1/menu`
- `POST /v1/orders` `{..., lat?, lng?}` → `{id, number, track_token, subtotal, delivery_fee, delivery_km, total}`. Prices come from the database (today's offer prices included), never the client. Send `X-Client: app` from the Android app. Rule failures return 422 with `code`: `closed`, `below_minimum` or `too_far`.
- `GET /v1/orders/{id}?t={track_token}` → status, `prep_minutes`, `ready_at`, timeline. Polled every 10 s.
- `GET /v1/shop`: minimums, free-delivery rule, whether orders are open, notice.
- `GET /v1/offers`: live offers of the day / month.
- `GET /v1/badge?phone=`: finished-order count and badge for a number. `GET /v1/regulars`: this month's top 5 (first name and last 2 digits only) and the badge tiers.

Shop rules (defaults, changeable in the staff area): delivery minimum ₹500, pickup no minimum, free delivery within 5 km on orders of ₹500 or more, no delivery past 5 km, ₹40 charge otherwise. Distance is straight-line from the cart location the owner saves from the tablet; if the customer doesn't share a location, the order goes through and the owner checks by phone.

Badges count finished orders per phone number from the website, app and walk-in sales: First Bite (1), Regular (3), Gold Regular (10), Urban Legend (25). The top customer of the month (at least 3 orders) is "Foodie of the Month".

Staff (`Authorization: Bearer <jwt>` from `POST /v1/owner/login {email, password}` → `{token, user}`):
- `GET /v1/me`
- `GET /v1/owner/orders?status=active|all`, `GET /v1/owner/orders/{id}`
- `PATCH /v1/owner/orders/{id}` `{status?, prep_minutes?, payment_status?}`. `prep_minutes` sets `ready_at = now + prep_minutes`: the customer's countdown.
- `GET /v1/owner/menu`, `PATCH /v1/owner/menu/items/{id}` `{full?, half?, available?}`
- `GET /v1/owner/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD` (IST days, completed orders)
- `PATCH /v1/owner/shop` `{accepting_orders?, min_order_delivery?, min_order_pickup?, free_delivery_min?, free_delivery_km?, max_delivery_km?, delivery_fee?, cart_lat?, cart_lng?, notice?}`
- `GET /v1/owner/offers`, `POST /v1/owner/offers` `{period: day|month, title, description, item_id?, offer_price?, starts_on?, ends_on?}`, `PUT /v1/owner/offers/{id}`, `POST /v1/owner/offers/{id}/end`
- `POST /v1/owner/counter-sales` `{customer_name?, customer_phone?, payment_method, items? | amount}`: a walk-in sale, saved as completed and paid.
- Owner order lists include `customer_orders` and `customer_badge` for each order's phone number.

Admin only: `GET /v1/admin/users`, `POST /v1/admin/users {email, name, role, password}`, `PATCH /v1/admin/users/{id} {active?, password?, role?, name?}`.

Statuses: `placed → preparing → ready | out_for_delivery → completed`, or `cancelled`.

## Hosting (near-zero cost)

- Domain `theurbanbites.in`; nameservers on Cloudflare (free).
- Website: Cloudflare Pages, build command `npm run build`, output `web/dist`, env `VITE_API_URL=https://api.theurbanbites.in`.
- API: `GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap ./cmd/api`, zip, Lambda runtime `provided.al2023`, API Gateway HTTP API with custom domain `api.theurbanbites.in` (ACM cert). Env: `DATABASE_URL`, `JWT_SECRET` (long random), `ALLOWED_ORIGINS=https://theurbanbites.in`.
- Database: Neon free Postgres (`DATABASE_URL` with `sslmode=require`). Migrations run on startup.
