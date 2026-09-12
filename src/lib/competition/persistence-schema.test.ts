import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
const enums = new Map(Prisma.dmmf.datamodel.enums.map((prismaEnum) => [prismaEnum.name, prismaEnum]));

function field(modelName: string, fieldName: string) {
  const model = models.get(modelName);
  expect(model, `missing Prisma model ${modelName}`).toBeDefined();

  const modelField = model?.fields.find((candidate) => candidate.name === fieldName);
  expect(modelField, `missing ${modelName}.${fieldName}`).toBeDefined();
  return modelField!;
}

function uniqueConstraint(modelName: string, fields: string[]) {
  expect(models.get(modelName)?.uniqueFields).toContainEqual(fields);
}

describe("competition operations persistence Prisma contract", () => {
  it("models the bounded match-day states required by the operations workflow", () => {
    expect(enums.get("CompetitionPhaseStatus")?.values.map(({ name }) => name)).toEqual([
      "draft",
      "active",
      "completed",
    ]);
    expect(enums.get("MatchScheduleStatus")?.values.map(({ name }) => name)).toEqual([
      "estimated",
      "confirmed",
      "locked",
      "delayed",
      "live",
      "completed",
      "postponed",
    ]);
    expect(enums.get("MatchReadinessStatus")?.values.map(({ name }) => name)).toEqual([
      "pending",
      "checked_in",
      "ready",
      "not_ready",
    ]);
    expect(enums.get("ReadinessActor")?.values.map(({ name }) => name)).toEqual(["organizer", "captain"]);
    expect(enums.get("CompetitionActionPriority")?.values.map(({ name }) => name)).toEqual([
      "critical",
      "urgent",
      "attention_soon",
    ]);
    expect(enums.get("AnnouncementStatus")?.values.map(({ name }) => name)).toEqual(["draft", "published"]);
    expect(enums.get("ScheduleRevisionStatus")?.values.map(({ name }) => name)).toEqual(["draft", "published"]);
  });

  it("keeps graph slots, immutable result snapshots, and schedule review state structured", () => {
    expect(field("MatchDependency", "outcome")).toMatchObject({ type: "MatchDependencyOutcome" });
    expect(field("MatchDependency", "targetSlot")).toMatchObject({ type: "MatchDependencySlot" });
    expect(enums.get("MatchDependencyOutcome")?.values.map(({ name }) => name)).toEqual(["winner", "loser"]);
    expect(enums.get("MatchDependencySlot")?.values.map(({ name }) => name)).toEqual(["home", "away"]);
    uniqueConstraint("MatchDependency", ["targetMatchId", "targetSlot"]);

    for (const fieldName of ["homeScore", "awayScore", "scoreSnapshot", "actorUserId", "reason", "idempotencyKey"]) {
      expect(field("MatchResultRevision", fieldName)).toBeDefined();
    }
    expect(field("MatchResultRevision", "version")).toMatchObject({ type: "Int", isRequired: true });
    uniqueConstraint("MatchResultRevision", ["matchId", "version"]);
    uniqueConstraint("MatchResultRevision", ["matchId", "idempotencyKey"]);

    expect(field("ScheduleRevision", "status")).toMatchObject({
      type: "ScheduleRevisionStatus",
      default: "draft",
    });
    expect(field("ScheduleRevision", "snapshot")).toMatchObject({ type: "Json", isRequired: true });
    uniqueConstraint("ScheduleRevision", ["eventId", "version"]);
    uniqueConstraint("ScheduleRevision", ["eventId", "idempotencyKey"]);
  });

  it("adds additive operations records and preserves legacy match scheduling alongside typed fields", () => {
    for (const modelName of [
      "CompetitionPhase",
      "CompetitionGroup",
      "CompetitionGroupMember",
      "MatchDependency",
      "MatchReadiness",
      "MatchResultRevision",
      "CompetitionActionItem",
      "CompetitionIncident",
      "CompetitionAuditLog",
      "ScheduleRevision",
      "EventAnnouncement",
    ]) {
      expect(models.has(modelName), `missing Prisma model ${modelName}`).toBe(true);
    }

    uniqueConstraint("CompetitionGroupMember", ["groupId", "teamId"]);
    uniqueConstraint("MatchReadiness", ["matchId", "teamId"]);
    uniqueConstraint("CompetitionActionItem", ["eventId", "conditionKey"]);

    expect(field("Match", "scheduledLabel")).toMatchObject({ type: "String", isRequired: false });
    expect(field("Match", "scheduledAt")).toMatchObject({ type: "DateTime", isRequired: false });
    expect(field("Match", "scheduleStatus")).toMatchObject({ type: "MatchScheduleStatus", default: "estimated" });
    expect(field("Match", "resultVersion")).toMatchObject({ type: "Int", default: 0 });
    expect(field("Match", "resultSnapshot")).toMatchObject({ type: "Json", isRequired: false });

    expect(field("Event", "competitionPhases")).toMatchObject({ type: "CompetitionPhase", isList: true });
    expect(field("Team", "competitionGroupMemberships")).toMatchObject({ type: "CompetitionGroupMember", isList: true });
    expect(field("User", "resultRevisions")).toMatchObject({ type: "MatchResultRevision", isList: true });
  });
});

describe("competition operations persistence migration", () => {
  const migrationPath = fileURLToPath(
    new URL("../../../prisma/migrations/20260912000000_competition_operations_v3_foundation/migration.sql", import.meta.url),
  );

  it("is additive and creates the indexes needed for operation idempotency and revisions", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('CREATE TYPE "CompetitionPhaseStatus"');
    expect(migration).toContain('CREATE TABLE "MatchResultRevision"');
    expect(migration).toContain('CREATE UNIQUE INDEX "MatchResultRevision_matchId_version_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "ScheduleRevision_eventId_version_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "CompetitionActionItem_eventId_conditionKey_key"');
    expect(migration).toContain('ADD COLUMN "scheduledAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "resultVersion" INTEGER NOT NULL DEFAULT 0');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });
});


describe("result-revision persistence hardening", () => {
  const migrationPath = fileURLToPath(
    new URL("../../../prisma/migrations/20260912000000_competition_operations_v3_foundation/migration.sql", import.meta.url),
  );

  it("requires an attributable reason and protects sequential history from update or delete", () => {
    expect(field("MatchResultRevision", "actorUserId")).toMatchObject({ isRequired: true });
    expect(field("MatchResultRevision", "reason")).toMatchObject({ isRequired: true });

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE FUNCTION "enforce_match_result_revision"()');
    expect(migration).toContain('pg_advisory_xact_lock(hashtext(NEW."matchId"))');
    expect(migration).toContain('NEW."version" <> expected_version');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OR DELETE ON "MatchResultRevision"');
    expect(migration).toContain("Match result revisions are append-only");
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
  });
});

describe("competition ownership integrity", () => {
  const migrationPath = fileURLToPath(
    new URL("../../../prisma/migrations/20260912000000_competition_operations_v3_foundation/migration.sql", import.meta.url),
  );

  it("constrains representative match, team, and phase references to the same event", () => {
    const migration = readFileSync(migrationPath, "utf8");

    for (const constraint of [
      'FOREIGN KEY ("eventId", "sourceMatchId") REFERENCES "Match"("eventId", "id")',
      'FOREIGN KEY ("eventId", "targetMatchId") REFERENCES "Match"("eventId", "id")',
      'FOREIGN KEY ("eventId", "matchId") REFERENCES "Match"("eventId", "id")',
      'FOREIGN KEY ("eventId", "teamId") REFERENCES "Team"("eventId", "id")',
      'FOREIGN KEY ("eventId", "phaseId") REFERENCES "CompetitionPhase"("eventId", "id")',
    ]) {
      expect(migration).toContain(constraint);
    }
  });

  it("does not null a required event key when a composite reference is removed", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('"Match_phaseId_fkey" FOREIGN KEY ("eventId", "phaseId") REFERENCES "CompetitionPhase"("eventId", "id") ON DELETE RESTRICT');
    expect(migration).toContain('"Match_groupId_fkey" FOREIGN KEY ("eventId", "groupId") REFERENCES "CompetitionGroup"("eventId", "id") ON DELETE RESTRICT');
    expect(migration).toContain('"CompetitionIncident_matchId_fkey" FOREIGN KEY ("eventId", "matchId") REFERENCES "Match"("eventId", "id") ON DELETE RESTRICT');
    expect(migration).toContain('"CompetitionAuditLog_matchId_fkey" FOREIGN KEY ("eventId", "matchId") REFERENCES "Match"("eventId", "id") ON DELETE RESTRICT');
  });

  it("creates composite keys before composite foreign keys", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration.indexOf('CREATE UNIQUE INDEX "Match_eventId_id_key"')).toBeLessThan(
      migration.indexOf('ALTER TABLE "Match" ADD CONSTRAINT "Match_phaseId_fkey"'),
    );
    expect(migration.indexOf('CREATE UNIQUE INDEX "Team_eventId_id_key"')).toBeLessThan(
      migration.indexOf('ALTER TABLE "MatchReadiness" ADD CONSTRAINT "MatchReadiness_teamId_fkey"'),
    );
  });

  it("retains both idempotency indexes and legacy match identity/query constraints", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE UNIQUE INDEX "MatchResultRevision_matchId_idempotencyKey_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "ScheduleRevision_eventId_idempotencyKey_key"');

    uniqueConstraint("Match", ["eventId", "round", "slot"]);
    expect(field("Match", "status")).toMatchObject({ type: "String", default: "Scheduled" });

    const legacyMatchMigration = readFileSync(
      fileURLToPath(new URL("../../../prisma/migrations/20260817100000_add_match_event_round_slot_unique/migration.sql", import.meta.url)),
      "utf8",
    );
    expect(legacyMatchMigration).toContain('ALTER TABLE "Match" ADD CONSTRAINT "Match_eventId_round_slot_key" UNIQUE');
    expect(migration).not.toMatch(/DROP\s+(?:INDEX|CONSTRAINT)\s+"Match_/i);
  });
});


describe("legacy relation compatibility", () => {
  it("retains legacy optional-relation delete policies", () => {
    for (const [modelName, fieldName] of [
      ["Event", "organizer"],
      ["Event", "activeVisualAsset"],
      ["EventPreviewToken", "createdByUser"],
      ["EventEditRevision", "createdByUser"],
    ]) {
      expect(field(modelName, fieldName)).toMatchObject({ relationOnDelete: "SetNull" });
    }
  });
});


function relation(modelName: string, fieldName: string) {
  const relationField = field(modelName, fieldName);
  expect(relationField.kind, modelName + "." + fieldName + " must be a relation").toBe("object");
  return relationField;
}

describe("event-scoped relation metadata", () => {
  it("models every competition entity relation with its event ownership key", () => {
    for (const [modelName, fieldName, target, foreignKey] of [
      ["Match", "phase", "CompetitionPhase", "phaseId"],
      ["Match", "group", "CompetitionGroup", "groupId"],
      ["CompetitionGroup", "phase", "CompetitionPhase", "phaseId"],
      ["CompetitionGroupMember", "group", "CompetitionGroup", "groupId"],
      ["CompetitionGroupMember", "team", "Team", "teamId"],
      ["MatchDependency", "sourceMatch", "Match", "sourceMatchId"],
      ["MatchDependency", "targetMatch", "Match", "targetMatchId"],
      ["MatchReadiness", "match", "Match", "matchId"],
      ["MatchReadiness", "team", "Team", "teamId"],
      ["MatchResultRevision", "match", "Match", "matchId"],
      ["CompetitionActionItem", "match", "Match", "matchId"],
      ["CompetitionActionItem", "team", "Team", "teamId"],
      ["CompetitionIncident", "match", "Match", "matchId"],
      ["CompetitionAuditLog", "match", "Match", "matchId"],
    ]) {
      expect(relation(modelName, fieldName)).toMatchObject({
        type: target,
        relationFromFields: ["eventId", foreignKey],
        relationToFields: ["eventId", "id"],
      });
    }
  });

  it("ties an optional winner to a team from the same event", () => {
    expect(field("MatchResultRevision", "winnerTeamId")).toMatchObject({ isRequired: false, type: "String" });
    expect(relation("MatchResultRevision", "winnerTeam")).toMatchObject({
      type: "Team",
      isRequired: false,
      relationFromFields: ["eventId", "winnerTeamId"],
      relationToFields: ["eventId", "id"],
    });
  });
});

describe("result-revision cascade durability", () => {
  const migrationPath = fileURLToPath(
    new URL("../../../prisma/migrations/20260912000000_competition_operations_v3_foundation/migration.sql", import.meta.url),
  );

  it("rejects direct history deletion while allowing foreign-key cascade deletion", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("IF TG_OP = 'DELETE' THEN");
    expect(migration).toContain('pg_trigger_depth() > 1');
    expect(migration).toContain('NOT EXISTS (SELECT 1 FROM "Match" WHERE "id" = OLD."matchId")');
    expect(migration).toContain("RETURN OLD;");
    expect(migration).toContain("Match result revisions are append-only");
  });
});
