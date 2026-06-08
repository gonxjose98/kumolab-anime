-- merch_settings — KumoLab-side display overrides for the Printful storefront.
--
-- Why this table exists:
--   • is_featured  — the storefront shows ONLY featured products (single-hero
--                    model). Printful's own visibility flag isn't reliably
--                    surfaced via /sync/products, so we gate it here.
--   • anchor_price — a COSMETIC compare-at price (the struck-through "was"
--                    number that makes the live price read as a discount).
--                    It is display-only and is NEVER charged.
--
-- The REAL (charged) price is never stored here — it is always pulled live
-- from Printful's retail_price at render + checkout time, so the website price
-- can physically never drift from what Printful/Stripe actually charges.
CREATE TABLE IF NOT EXISTS merch_settings (
    product_id   text PRIMARY KEY,         -- Printful sync_product id (as text)
    is_featured  boolean NOT NULL DEFAULT false,
    anchor_price numeric(10,2),            -- cosmetic compare-at; NULL = no anchor shown
    label        text,                     -- e.g. 'Launch price', 'Founders price'
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE merch_settings IS 'KumoLab-side merch display overrides (featured flag + cosmetic anchor price). Real charged price always comes live from Printful.';

-- Server-only access. All reads/writes go through supabaseAdmin (service role,
-- which bypasses RLS); the anon/browser key gets nothing. No public policies.
ALTER TABLE merch_settings ENABLE ROW LEVEL SECURITY;
