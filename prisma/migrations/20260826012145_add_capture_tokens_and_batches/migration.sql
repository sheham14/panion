-- CreateEnum
CREATE TYPE "CaptureBatchStatus" AS ENUM ('pending', 'imported', 'discarded');

-- CreateTable
CREATE TABLE "capture_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "label" TEXT,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_batches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "store_id" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "payload" JSONB NOT NULL,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "status" "CaptureBatchStatus" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "capture_tokens_token_hash_key" ON "capture_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "capture_tokens_user_id_idx" ON "capture_tokens"("user_id");

-- CreateIndex
CREATE INDEX "capture_batches_user_id_status_created_at_idx" ON "capture_batches"("user_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "capture_tokens" ADD CONSTRAINT "capture_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_batches" ADD CONSTRAINT "capture_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_batches" ADD CONSTRAINT "capture_batches_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
