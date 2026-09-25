import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const sourcePath = resolve(root, "tests/e2e/public-v3-seeded-events.spec.ts");
const source = readFileSync(sourcePath, "utf8").replace(/\r\n?/g, "\n");
const cleanupStart = "  async function clearEventCompetition(eventId: string) {";
const cleanupEnd = "\n\n  async function installUnknownPhaseLessMatch()";

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

function extractFunction(spec: string, startMarker: string, endMarker: string) {
  const start = spec.indexOf(startMarker);
  const end = spec.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate ${startMarker.trim()}`);
  return spec.slice(start, end);
}

function assertSeedHelpersContract(spec: string) {
  const runSeed = extractFunction(spec, "  function runSeed() {", "\n\n  function runSeedExpectFailure() {");
  const runSeedExpectFailure = extractFunction(
    spec,
    "  function runSeedExpectFailure() {",
    "\n\n  async function clearEventCompetition",
  );
  const sharedSpawnContract = [
    'const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";',
    'const args = isWindows ? ["/d", "/s", "/c", "pnpm db:seed"] : ["db:seed"];',
    "spawnSync(command, args, {",
    "cwd: process.cwd(),",
    "env: process.env,",
    'encoding: "utf8",',
    "windowsHide: true,",
  ];

  for (const contract of sharedSpawnContract) {
    expect(runSeed).toContain(contract);
    expect(runSeedExpectFailure).toContain(contract);
  }
  expect(runSeed).toContain("const result = spawnSync(command, args, {");
  expect(runSeed).toContain("const failure = result.error?.message || result.stderr || result.stdout;");
  expect(runSeed).toContain("expect(result.status, failure).toBe(0);");
  expect(runSeedExpectFailure).toContain("return spawnSync(command, args, {");
  expect(runSeedExpectFailure).not.toMatch(/expect\(result\.status|\.toBe\(0\)/);
}

function assertUnknownMatchPreservationContract(spec: string) {
  const testBlock = extractFunction(
    spec,
    '  test("refuses an unknown phase-less match without deleting it", async () => {',
    '\n\n  test("upgrades blocking legacy Flashpeak rows and remains idempotent"',
  );
  const installIndex = testBlock.indexOf("await installUnknownPhaseLessMatch();");
  const beforeIndex = testBlock.indexOf("const before = await prisma.match.findUniqueOrThrow({");
  const seedIndex = testBlock.indexOf("const result = runSeedExpectFailure();");
  const failureIndex = testBlock.indexOf("expect(result.status, result.stderr || result.stdout).not.toBe(0);");
  const refusalIndex = testBlock.indexOf('toContain("Refusing to replace non-fixture matches")');
  const afterIndex = testBlock.indexOf("const after = await prisma.match.findUniqueOrThrow({");
  const equalityIndex = testBlock.indexOf("expect(after).toEqual(before);");
  const cleanupIndex = testBlock.indexOf("await prisma.match.delete({ where: { id: UNKNOWN_FLASHPEAK_MATCH_ID } });");
  const preservationSelect =
    "select: { id: true, eventId: true, homeTeamId: true, awayTeamId: true, status: true, round: true, slot: true }";

  expect(testBlock).toContain("where: { id: UNKNOWN_FLASHPEAK_MATCH_ID }");
  expect(countLiteral(testBlock, preservationSelect)).toBe(2);
  expect(installIndex).toBeGreaterThan(-1);
  expect(beforeIndex).toBeGreaterThan(installIndex);
  expect(seedIndex).toBeGreaterThan(beforeIndex);
  expect(failureIndex).toBeGreaterThan(seedIndex);
  expect(refusalIndex).toBeGreaterThan(failureIndex);
  expect(afterIndex).toBeGreaterThan(refusalIndex);
  expect(equalityIndex).toBeGreaterThan(afterIndex);
  expect(cleanupIndex).toBeGreaterThan(equalityIndex);
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

  it("protects the runSeed success and runSeedExpectFailure process contracts", () => {
    expect(() => assertSeedHelpersContract(source)).not.toThrow();
  });

  it("protects exact unknown phase-less match preservation evidence", () => {
    expect(() => assertUnknownMatchPreservationContract(source)).not.toThrow();
  });

  it("rejects mutations to seed-result semantics", () => {
    const successMutation = source.replace(
      "expect(result.status, failure).toBe(0);",
      "expect(result.status, failure).not.toBe(0);",
    );
    const failureMutation = source.replace(
      "return spawnSync(command, args, {",
      "const result = spawnSync(command, args, {",
    );

    expect(() => assertSeedHelpersContract(successMutation)).toThrow();
    expect(() => assertSeedHelpersContract(failureMutation)).toThrow();
  });

  it("rejects mutations that weaken unknown-match preservation", () => {
    const statusMutation = source.replace(
      "expect(result.status, result.stderr || result.stdout).not.toBe(0);",
      "expect(result.status, result.stderr || result.stdout).toBe(0);",
    );
    const equalityMutation = source.replace("expect(after).toEqual(before);", "expect(after.id).toBe(before.id);");
    const earlyCleanupMutation = source.replace(
      "const after = await prisma.match.findUniqueOrThrow({",
      "await prisma.match.delete({ where: { id: UNKNOWN_FLASHPEAK_MATCH_ID } });\n    const after = await prisma.match.findUniqueOrThrow({",
    );

    expect(() => assertUnknownMatchPreservationContract(statusMutation)).toThrow();
    expect(() => assertUnknownMatchPreservationContract(equalityMutation)).toThrow();
    expect(() => assertUnknownMatchPreservationContract(earlyCleanupMutation)).toThrow();
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
