-- Durable receipts are nullable so existing immutable audit history is untouched.
ALTER TABLE "CompletionAuditEntry"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "result" JSONB;

CREATE UNIQUE INDEX "CompletionAuditEntry_completionId_idempotencyKey_key"
  ON "CompletionAuditEntry"("completionId", "idempotencyKey");
