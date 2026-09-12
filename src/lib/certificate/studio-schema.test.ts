import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
describe("Certificate Studio additive persistence contract", () => {
  const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260912180000_certificate_studio_claims/migration.sql"), "utf8");
  const snapshotMigration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260912191000_certificate_snapshot_mutations/migration.sql"), "utf8");
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
  it("binds V3 artifacts to completion snapshots and stores immutable generation outcomes additively", () => {
    for (const field of ["completionId", "completionVersion", "storageProvider", "storageKey", "contentSha256", "purpose"]) expect(schema).toContain(field);
    expect(schema).toContain("model CertificateGenerationMutation");
    expect(schema).toContain("@@unique([eventId, idempotencyKey])");
    expect(snapshotMigration).toContain('CREATE TABLE "CertificateGenerationMutation"');
    expect(snapshotMigration).toContain('FOREIGN KEY ("completionId") REFERENCES "TournamentCompletion"');
    expect(snapshotMigration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

});
