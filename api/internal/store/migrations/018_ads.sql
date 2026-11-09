-- Ads: sponsor banners the admin sells to local businesses (or uses for the shop's own promos).
-- place: home = website/app home page, tracker = customer's order tracking page, staff = owner's orders screen.
-- views and clicks are counted so the admin can show a sponsor what they got.
CREATE TABLE IF NOT EXISTS ads (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title       text NOT NULL,
    body        text NOT NULL DEFAULT '',
    cta         text NOT NULL DEFAULT '',
    link_url    text NOT NULL DEFAULT '',
    phone       text NOT NULL DEFAULT '',
    place       text NOT NULL CHECK (place IN ('home', 'tracker', 'staff')),
    active      boolean NOT NULL DEFAULT true,
    starts_on   date,
    ends_on     date,
    sort        int NOT NULL DEFAULT 0,
    image       bytea,
    image_type  text NOT NULL DEFAULT '',
    views       bigint NOT NULL DEFAULT 0,
    clicks      bigint NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_place ON ads (place) WHERE active;
