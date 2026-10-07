-- Lease state is additive so existing terminal mutation history remains valid.
ALTER TABLE "CertificateGenerationMutation"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseOwnerId" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
