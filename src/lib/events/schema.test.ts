import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));

function field(modelName: string, fieldName: string) {
  const model = models.get(modelName);
  expect(model, `missing Prisma model ${modelName}`).toBeDefined();

  const modelField = model?.fields.find((candidate) => candidate.name === fieldName);
  expect(modelField, `missing ${modelName}.${fieldName}`).toBeDefined();
  return modelField!;
}

describe("event lifecycle Prisma contract", () => {
  it("exposes an optional one-to-one organizer profile with contact and verification data", () => {
    expect(field("User", "organizerProfile")).toMatchObject({
      kind: "object",
      type: "OrganizerProfile",
      isList: false,
      isRequired: false,
    });
    expect(field("OrganizerProfile", "userId")).toMatchObject({
      kind: "scalar",
      type: "String",
      isUnique: true,
      isRequired: true,
    });
    expect(field("OrganizerProfile", "organizationName")).toMatchObject({ type: "String", isRequired: true });
    expect(field("OrganizerProfile", "contactChannel")).toMatchObject({ type: "String", isRequired: true });
    expect(field("OrganizerProfile", "contactValue")).toMatchObject({ type: "String", isRequired: true });
    expect(field("OrganizerProfile", "verified")).toMatchObject({
      type: "Boolean",
      isRequired: true,
      default: false,
    });
    expect(field("OrganizerProfile", "verifiedAt")).toMatchObject({ type: "DateTime", isRequired: false });
  });

  it("adds nullable structured lifecycle dates without replacing legacy display strings", () => {
    for (const fieldName of ["registrationOpensAt", "registrationClosesAt", "eventStartsAt", "publishedAt"]) {
      expect(field("Event", fieldName)).toMatchObject({ type: "DateTime", isRequired: false });
    }

    expect(field("Event", "timezone")).toMatchObject({ type: "String", default: "Asia/Jakarta" });
    expect(field("Event", "venueAddress")).toMatchObject({ type: "String", isRequired: false });
    expect(field("Event", "draftRevision")).toMatchObject({ type: "Int", default: 0 });
    expect(field("Event", "previewRevision")).toMatchObject({ type: "Int", default: 0 });
    expect(field("Event", "registrationWindow")).toMatchObject({ type: "String", isRequired: true });
    expect(field("Event", "startsAt")).toMatchObject({ type: "String", isRequired: true });
  });

  it("stores only a hashed, expiring, revocable preview credential with ownership audit", () => {
    expect(models.has("EventPreviewToken")).toBe(true);
    expect(field("EventPreviewToken", "tokenHash")).toMatchObject({
      type: "String",
      isUnique: true,
      isRequired: true,
    });
    expect(field("EventPreviewToken", "event")).toMatchObject({ kind: "object", type: "Event", isRequired: true });
    expect(field("EventPreviewToken", "createdByUser")).toMatchObject({
      kind: "object",
      type: "User",
      isRequired: false,
    });
    expect(field("EventPreviewToken", "expiresAt")).toMatchObject({ type: "DateTime", isRequired: true });
    expect(field("EventPreviewToken", "revokedAt")).toMatchObject({ type: "DateTime", isRequired: false });
    expect(models.get("EventPreviewToken")?.fields.some(({ name }) => name === "token")).toBe(false);
  });
});

describe("event lifecycle migration", () => {
  const migrationPath = fileURLToPath(
    new URL("../../../prisma/migrations/20260905010000_v3_event_lifecycle/migration.sql", import.meta.url),
  );
  const migration = readFileSync(migrationPath, "utf8");

  it("keeps legacy event rows valid while adding lifecycle defaults", () => {
    expect(migration).toContain('ADD COLUMN "registrationOpensAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "registrationClosesAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "eventStartsAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "publishedAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "timezone" TEXT NOT NULL DEFAULT \'Asia/Jakarta\'');
    expect(migration).not.toContain('DROP COLUMN "registrationWindow"');
    expect(migration).not.toContain('DROP COLUMN "startsAt"');
  });

  it("creates unique hash lookup and active-token management indexes", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "EventPreviewToken_tokenHash_key" ON "EventPreviewToken"("tokenHash")',
    );
    expect(migration).toContain(
      'CREATE INDEX "EventPreviewToken_eventId_revokedAt_expiresAt_idx" ON "EventPreviewToken"("eventId", "revokedAt", "expiresAt")',
    );
    expect(migration).not.toMatch(/"token"\s+TEXT/);
  });
});
