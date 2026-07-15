-- abandoned_carts — checkout-stage cart-recovery log (B6).
--
-- One row per expired Stripe Checkout Session that had a customer email.
-- The stripe webhook (checkout.session.expired) upserts here keyed by
-- stripe_session_id and sends ONE recovery email; recovery_sent_at marks
-- that the email went out so Stripe event redeliveries never double-send.
-- `recovered` can be flipped later if the customer comes back and buys.
CREATE TABLE IF NOT EXISTS abandoned_carts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email             text NOT NULL,
    items             jsonb,          -- snapshot from the session metadata (variantId/quantity/name)
    amount            numeric,        -- session amount_total, in dollars
    currency          text,
    stripe_session_id text UNIQUE,
    recovered         boolean DEFAULT false,
    recovery_sent_at  timestamptz,
    created_at        timestamptz DEFAULT now()
);

COMMENT ON TABLE abandoned_carts IS 'Expired Stripe checkout sessions with a known email; one recovery email each (recovery_sent_at set on send).';

-- Server-only access. All reads/writes go through supabaseAdmin (service role,
-- which bypasses RLS); the anon/browser key gets nothing. No public policies.
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;
