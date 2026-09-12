import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
describe("Certificate Studio additive persistence contract", () => {
  const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260912180000_certificate_studio_claims/migration.sql"), "utf8");
  it("adds durable claims and event-scoped idempotency without replacing legacy certificate columns", () => {
    for (const field of ["generationAttemptId", "generationClaimedAt", "generationIdempotencyKey", "generationFingerprint", "generationActorUserId"]) expect(schema).toContain(field);
    expect(schema).toContain("@@unique([eventId, type, generationIdempotencyKey])");
    expect(schema).toContain("imageUrl");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
  it("stores append-only publication manifests and a separate optimistic revision", () => {
    expect(schema).toContain("model CertificatePublication");
    expect(schema).toContain("certificateRevision");
    expect(schema).toContain("@@unique([eventId, idempotencyKey])");
    expect(migration).toContain('"certificateIds" JSONB NOT NULL');
  });
});
