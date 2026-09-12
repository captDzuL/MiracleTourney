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
