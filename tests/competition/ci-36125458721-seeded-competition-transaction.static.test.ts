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
const extraOperationStatement =
  'prisma.event.updateMany({ where: { id: eventId }, data: { status: "Registration Closed" } })';

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

function matchingDelimiter(sourceText: string, openingIndex: number) {
  const pairs = { "(": ")", "{": "}", "[": "]" } as const;
  const openings = Object.keys(pairs) as Array<keyof typeof pairs>;
  const stack: Array<keyof typeof pairs> = [sourceText[openingIndex] as keyof typeof pairs];
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;

  for (let index = openingIndex + 1; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (openings.includes(character as keyof typeof pairs)) {
      stack.push(character as keyof typeof pairs);
    } else if (character === pairs[stack[stack.length - 1]]) {
      stack.pop();
      if (stack.length === 0) return index;
    }
  }

  return -1;
}

function splitTopLevelEntries(sourceText: string) {
  const entries: string[] = [];
  const stack: Array<keyof typeof pairs> = [];
  const pairs = { "(": ")", "{": "}", "[": "]" } as const;
  const openings = Object.keys(pairs) as Array<keyof typeof pairs>;
  let entryStart = 0;
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;

  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (openings.includes(character as keyof typeof pairs)) {
      stack.push(character as keyof typeof pairs);
    } else if (character === pairs[stack[stack.length - 1]]) {
      stack.pop();
    } else if (character === "," && stack.length === 0) {
      const entry = sourceText.slice(entryStart, index).trim();
      if (entry) entries.push(entry);
      entryStart = index + 1;
    }
  }

  const finalEntry = sourceText.slice(entryStart).trim();
  if (finalEntry) entries.push(finalEntry);
  return entries;
}

function transactionEntries(block: string) {
  const transaction = /prisma\.\$transaction\s*\(\s*\[/.exec(block);
  if (!transaction) return [];
  const arrayStart = block.indexOf("[", transaction.index);
  const arrayEnd = matchingDelimiter(block, arrayStart);
  if (arrayEnd < 0) return [];
  return splitTopLevelEntries(block.slice(arrayStart + 1, arrayEnd));
}

function unwrapParenthesized(entry: string) {
  let candidate = entry.trim();
  while (candidate.startsWith("(")) {
    const closingIndex = matchingDelimiter(candidate, 0);
    if (closingIndex !== candidate.length - 1) break;
    candidate = candidate.slice(1, -1).trim();
  }
  return candidate;
}

function operationSequence(block: string) {
  return transactionEntries(block).map((entry) => {
    const operation = /^prisma\.([A-Za-z]\w*)\.([A-Za-z]\w*)\s*\(/.exec(unwrapParenthesized(entry));
    return operation ? `${operation[1]}.${operation[2]}` : "<non-prisma-entry>";
  });
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

  const entries = transactionEntries(block);
  expect(entries).toHaveLength(14);
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
      `      ${eventUpdateStatement},\n      ${extraOperationStatement},`,
    );

    expect(() => assertOrderedBatchTransaction(extraOperation)).toThrow();
  });

  it("rejects an extra operation despite changed indentation", () => {
    const extraOperation = validCleanupBlock.replace(
      `      ${eventUpdateStatement},`,
      `      ${eventUpdateStatement},\n  ${extraOperationStatement},`,
    );

    expect(() => assertOrderedBatchTransaction(extraOperation)).toThrow();
  });

  it("rejects a parenthesized extra operation", () => {
    const extraOperation = validCleanupBlock.replace(
      `      ${eventUpdateStatement},`,
      `      ${eventUpdateStatement},\n(\n        ${extraOperationStatement}\n      ),`,
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
