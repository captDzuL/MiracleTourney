import { existsSync, readFileSync } from "node:fs";
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

describe("completion persistence Prisma contract", () => {
  it("persists one completion snapshot with podium, award, decision, and audit records", () => {
    for (const modelName of [
      "TournamentCompletion",
      "PodiumPlacement",
      "EventAward",
      "AwardDecision",
      "CompletionAuditEntry",
    ]) {
      expect(models.has(modelName), `missing Prisma model ${modelName}`).toBe(true);
    }

    expect(field("TournamentCompletion", "eventId")).toMatchObject({
      type: "String",
      isRequired: true,
      isUnique: true,
    });
    expect(field("TournamentCompletion", "sourceSnapshot")).toMatchObject({ type: "Json", isRequired: true });
    expect(field("PodiumPlacement", "rank")).toMatchObject({ type: "Int", isRequired: true });
    expect(field("PodiumPlacement", "teamId")).toMatchObject({ type: "String", isRequired: true });
    expect(field("EventAward", "candidateSnapshot")).toMatchObject({ type: "Json", isRequired: true });
    expect(field("AwardDecision", "recipientId")).toMatchObject({ type: "String", isRequired: true });
    expect(field("CompletionAuditEntry", "details")).toMatchObject({ type: "Json", isRequired: true });
    expect(field("CompletionAuditEntry", "idempotencyKey")).toMatchObject({ type: "String", isRequired: false });
    expect(field("CompletionAuditEntry", "fingerprint")).toMatchObject({ type: "String", isRequired: false });
    expect(field("CompletionAuditEntry", "result")).toMatchObject({ type: "Json", isRequired: false });
  });

  it("supports multiple immutable certificate versions while keeping the legacy team relation", () => {
    expect(field("Event", "certificates")).toMatchObject({
      kind: "object",
      type: "Certificate",
      isList: true,
    });
    expect(models.get("Event")?.fields.some(({ name }) => name === "certificate")).toBe(false);
    expect(field("Certificate", "eventId")).toMatchObject({ type: "String", isUnique: false });
    expect(field("Certificate", "teamId")).toMatchObject({ type: "String", isRequired: true });

    const requiredDefaults = [
      ["type", "champion"],
      ["recipientKind", "team"],
      ["version", 1],
      ["templateVersion", "legacy-v1"],
      ["assetManifest", "{}"],
    ] as const;
    for (const [fieldName, defaultValue] of requiredDefaults) {
      expect(field("Certificate", fieldName)).toMatchObject({ isRequired: true, default: defaultValue });
    }

    for (const fieldName of ["recipientId", "recipientName", "verificationCode"]) {
      expect(field("Certificate", fieldName)).toMatchObject({ type: "String", isRequired: true });
    }
    for (const fieldName of ["publishedUrl", "generatedAt", "publishedAt", "supersededByVersion"]) {
      expect(field("Certificate", fieldName), `missing versioned certificate field ${fieldName}`).toBeDefined();
    }
    expect(field("Certificate", "renderManifest")).toMatchObject({
      type: "Json",
      isRequired: false,
    });
  });
});

describe("completion transaction adapter migration", () => {
  const migrationPath = fileURLToPath(
    new URL(
      "../../../prisma/migrations/20260913010000_completion_transaction_adapter/migration.sql",
      import.meta.url,
    ),
  );

  it("adds a durable unique idempotency receipt without rewriting completion history", () => {
    expect(existsSync(migrationPath), "missing completion transaction migration").toBe(true);
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    expect(migration).toContain('ADD COLUMN "idempotencyKey" TEXT');
    expect(migration).toContain('CREATE UNIQUE INDEX "CompletionAuditEntry_completionId_idempotencyKey_key"');
    expect(migration).not.toMatch(/UPDATE\s+"CompletionAuditEntry"/i);
  });
});

describe("completion persistence migration", () => {
  const migrationPath = fileURLToPath(
    new URL(
      "../../../prisma/migrations/20260912010000_v3_completion_certificates/migration.sql",
      import.meta.url,
    ),
  );

  it("backfills legacy champion certificates without changing their public identity", () => {
    expect(existsSync(migrationPath), "missing completion migration").toBe(true);
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

    expect(migration).toContain('DROP INDEX IF EXISTS "Certificate_eventId_key"');
    expect(migration).toContain('"type" TEXT NOT NULL DEFAULT \'champion\'');
    expect(migration).toContain('"recipientKind" TEXT NOT NULL DEFAULT \'team\'');
    expect(migration).toContain('"version" INTEGER NOT NULL DEFAULT 1');
    expect(migration).toContain('"recipientId" = "teamId"');
    expect(migration).toContain('"verificationCode" = "id"');
    expect(migration).toContain('"publishedUrl" = NULLIF("imageUrl", \'\')');
    expect(migration).not.toMatch(/UPDATE\s+"Certificate"[\s\S]*SET\s+"id"\s*=/i);
    expect(migration).not.toMatch(/UPDATE\s+"Certificate"[\s\S]*SET\s+"imageUrl"\s*=/i);
  });
});

describe("immutable certificate render manifest migration", () => {
  const migrationPath = fileURLToPath(
    new URL(
      "../../../prisma/migrations/20260912233000_certificate_render_manifest/migration.sql",
      import.meta.url,
    ),
  );

  it("adds a nullable manifest without rewriting legacy certificate history", () => {
    expect(existsSync(migrationPath), "missing render manifest migration").toBe(true);
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    expect(migration).toContain('ADD COLUMN "renderManifest" JSONB');
    expect(migration).not.toMatch(/UPDATE\s+"Certificate"/i);
  });
});
