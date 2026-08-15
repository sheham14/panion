-- The pre-sale price, so we can render "was $X, now $Y" and have a value to
-- revert to when a sale expires.
ALTER TABLE "store_products" ADD COLUMN IF NOT EXISTS "regular_price" DECIMAL(10,2);

-- PriceSource was declared in the schema but never referenced by any model.
-- PriceHistory.source stays a String so new provenance values ("flyer",
-- "partner") are convention rather than migrations. See PRICING-PIPELINE.md §5.1.
DROP TYPE IF EXISTS "PriceSource";

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration-history repair, not a new feature.
--
-- push_subscriptions was created on production with `prisma db push` and never
-- captured in a migration, so migration history and the production schema had
-- drifted. Prisma generated these statements to close that gap. Every statement
-- below is guarded so this migration succeeds both on a fresh database (where
-- it genuinely creates the table) and on production (where it is a no-op).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

DO $$
BEGIN
    ALTER TABLE "push_subscriptions"
        ADD CONSTRAINT "push_subscriptions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
