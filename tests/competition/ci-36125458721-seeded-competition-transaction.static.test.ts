import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const sourcePath = resolve(root, "tests/e2e/public-v3-seeded-events.spec.ts");
const source = readFileSync(sourcePath, "utf8").replace(/\r\n?/g, "\n");
const cleanupStart = "  async function clearEventCompetition(eventId: string) {";
const cleanupEnd = "\n\n  async function installUnknownPhaseLessMatch()";
const immutableSurfaceHash = "d4fa2434f50c2526302d853ccede2bea1958ae04698059d82ca62ca4e76dc006";

const deleteStatements = [
  "prisma.tournamentCompletion.deleteMany({ where: { eventId } })",
  "prisma.scheduleRevision.deleteMany({ where: { eventId } })",
  "prisma.matchReadiness.deleteMany({ where: { eventId } })",
  "prisma.matchGame.deleteMany({ where: { match: { eventId } } })",
  "prisma.matchResultRevision.deleteMany({ where: { eventId } })",
  "prisma.matchDependency.deleteMany({ where: { eventId } })",
  "prisma.competitionActionItem.deleteMany({ where: { eventId } })",
  "prisma.competitionIncident.deleteMany({ where: { eventId } })",
  "prisma.competitionAuditLog.deleteMany({ where: { eventId } })",
  "prisma.match.deleteMany({ where: { eventId } })",
  "prisma.competitionGroupMember.deleteMany({ where: { eventId } })",
  "prisma.competitionGroup.deleteMany({ where: { eventId } })",
  "prisma.competitionPhase.deleteMany({ where: { eventId } })",
] as const;

const eventUpdateStatement =
  'prisma.event.update({ where: { id: eventId }, data: { status: "Registration Closed", publishedScheduleVersion: null } })';

const expectedOperationSequence = [
  "tournamentCompletion.deleteMany",
  "scheduleRevision.deleteMany",
  "matchReadiness.deleteMany",
  "matchGame.deleteMany",
  "matchResultRevision.deleteMany",
  "matchDependency.deleteMany",
  "competitionActionItem.deleteMany",
  "competitionIncident.deleteMany",
  "competitionAuditLog.deleteMany",
  "match.deleteMany",
  "competitionGroupMember.deleteMany",
  "competitionGroup.deleteMany",
  "competitionPhase.deleteMany",
  "event.update",
] as const;

function extractCleanupBlock(spec: string) {
  const start = spec.indexOf(cleanupStart);
  const end = spec.indexOf(cleanupEnd, start + cleanupStart.length);
  if (start < 0 || end < 0) throw new Error("Unable to isolate clearEventCompetition");
  return spec.slice(start, end);
}

function operationSequence(block: string) {
  return [...block.matchAll(/^ {6}prisma\.([A-Za-z]\w*)\.([A-Za-z]\w*)\(/gm)].map(
    ([, model, method]) => `${model}.${method}`,
  );
}

function countLiteral(text: string, literal: string) {
  return text.split(literal).length - 1;
}

function assertOrderedBatchTransaction(block: string) {
  expect(countLiteral(block, "prisma.$transaction(")).toBe(1);
  expect(block).toContain("await prisma.$transaction([\n");
  expect(block).toContain("\n    ]);");
  expect(block).not.toContain("prisma.$transaction(async");
  expect(block).not.toContain("tx.");
  expect(block).not.toMatch(/await prisma\.(?!\$transaction)/);
  expect(block).not.toMatch(/\b(?:timeout|maxWait)\s*:/);
  expect(block).not.toMatch(/Promise\.all|\$executeRaw|\$queryRaw/);

  const operations = operationSequence(block);
  expect(operations).toHaveLength(14);
  expect(operations).toEqual(expectedOperationSequence);
  for (const statement of deleteStatements) {
    expect(countLiteral(block, statement)).toBe(1);
  }
  expect(countLiteral(block, eventUpdateStatement)).toBe(1);
}

function buildCleanupBlock(statements: readonly string[]) {
  return [
    cleanupStart,
    "    await prisma.$transaction([",
    ...statements.map((statement) => `      ${statement},`),
    "    ]);",
    "  }",
  ].join("\n");
}

const validCleanupBlock = buildCleanupBlock([...deleteStatements, eventUpdateStatement]);

describe("seeded competition cleanup transaction contract", () => {
  it("uses one ordered Prisma batch transaction for clearEventCompetition", () => {
    expect(() => assertOrderedBatchTransaction(extractCleanupBlock(source))).not.toThrow();
  });

  it("protects the seed helpers, fixture setup, and test assertions outside the cleanup helper", () => {
    const immutableSurface = source.replace(extractCleanupBlock(source), "<clearEventCompetition>");
    const digest = createHash("sha256").update(immutableSurface).digest("hex");

    expect(digest).toBe(immutableSurfaceHash);
    expect(immutableSurface).not.toMatch(/\b(?:db:reset|migrate\s+reset|reset\s+--force)\b/i);
  });

  it("rejects a phase delete moved before its groups", () => {
    const statements = [...deleteStatements, eventUpdateStatement];
    const groupIndex = statements.indexOf(deleteStatements[11]);
    const phaseIndex = statements.indexOf(deleteStatements[12]);
    [statements[groupIndex], statements[phaseIndex]] = [statements[phaseIndex], statements[groupIndex]];

    expect(() => assertOrderedBatchTransaction(buildCleanupBlock(statements))).toThrow();
  });

  it("rejects an event update moved before cleanup deletes", () => {
    const statements = [eventUpdateStatement, ...deleteStatements];

    expect(() => assertOrderedBatchTransaction(buildCleanupBlock(statements))).toThrow();
  });

  it("rejects a delete with its event scope removed", () => {
    const statements = [...deleteStatements, eventUpdateStatement];
    statements[1] = "prisma.scheduleRevision.deleteMany({ where: {} })";

    expect(() => assertOrderedBatchTransaction(buildCleanupBlock(statements))).toThrow();
  });

  it("rejects an extra top-level Prisma operation", () => {
    const extraOperation = validCleanupBlock.replace(
      `      ${eventUpdateStatement},`,
      `      ${eventUpdateStatement},\n      prisma.event.updateMany({ where: { id: eventId }, data: { status: "Registration Closed" } }),`,
    );

    expect(() => assertOrderedBatchTransaction(extraOperation)).toThrow();
  });

  it("rejects transaction timeout options and non-transactional escapes", () => {
    const withTimeout = validCleanupBlock.replace("    ]);", "    ], { timeout: 10 });");
    const withPromiseAll = validCleanupBlock.replace(
      "    prisma.tournamentCompletion.deleteMany({ where: { eventId } }),",
      "    Promise.all([]),",
    );
    const withRawSql = validCleanupBlock.replace(
      "    prisma.tournamentCompletion.deleteMany({ where: { eventId } }),",
      "    prisma.$executeRaw`DELETE FROM tournament_completion`,",
    );

    for (const mutation of [withTimeout, withPromiseAll, withRawSql]) {
      expect(() => assertOrderedBatchTransaction(mutation)).toThrow();
    }
  });
});
