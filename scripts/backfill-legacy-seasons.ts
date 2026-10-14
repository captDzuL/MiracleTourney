/**
 * Move finished old events (MFL Season 1-3) into the V3 data model so the organizer completion workspace works.
 *
 *   pnpm exec tsx --env-file=<env file> scripts/backfill-legacy-seasons.ts                       # DRY RUN, slugs starting with "mfl"
 *   pnpm exec tsx --env-file=<env file> scripts/backfill-legacy-seasons.ts mfl-s3 --json out.json # named events (slug or id)
 *   pnpm exec tsx --env-file=<env file> scripts/backfill-legacy-seasons.ts --apply --actor-user <user id>
 *
 * Without --apply nothing is written: the whole run is one transaction set READ ONLY, so the database refuses writes.
 * With --apply every event gets its own transaction. It is skipped when the event already has a competition phase,
 * result revisions or dependencies, and it is rolled back when what was written does not read back as planned.
 * Games and player statistics are never changed. Use --actor-user for the user recorded in the result history;
 * it is required unless the event has an organizer.
 */
import fs from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { evaluateBackfillGuard, planLegacyBackfill } from "../src/lib/tournament/operations/legacy-backfill";
import { applyLegacyBackfill } from "../src/lib/tournament/operations/legacy-backfill-apply";
import { describeBackfillResult, parseBackfillArgs, summarizePlan } from "../src/lib/tournament/operations/legacy-backfill-cli";
import { loadBackfillInput } from "../src/lib/tournament/operations/legacy-backfill-io";
import type { LegacyBackfillResult, ThirdPlaceSpec } from "../src/lib/tournament/operations/legacy-backfill-types";

/** Facts the old data does not hold, confirmed by the organizer. Keyed by event slug. */
const EVENT_SPECS: Record<string, { thirdPlace?: ThirdPlaceSpec }> = {
  "mfl-s3": {
    thirdPlace: {
      winnerTeamName: "Evrosheim",
      loserTeamName: "Helix Eclipse",
      reason: "Skor asli tidak tercatat; hanya pemenang yang dikonfirmasi organizer",
    },
  },
};

const DRY_RUN_ACTOR = "dry-run-actor";
const TRANSACTION_OPTIONS = { timeout: 120_000, maxWait: 10_000 } as const;

type EventRef = { id: string; slug: string; name: string; organizerUserId: string | null };
type Report = { slug: string; name: string; status: "plan" | "problems" | "skipped" | "applied" | "error"; detail: unknown };

class BackfillRefused extends Error {
  constructor(readonly problems: string[]) {
    super(`Backfill refused: ${problems.length} problem(s)`);
  }
}

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "").host || "(unknown)";
  } catch {
    return "(unset or unreadable)";
  }
}

async function dryRunEvent(tx: Prisma.TransactionClient, event: EventRef, actorUser: string | null): Promise<{ lines: string[]; report: Report }> {
  const actor = actorUser ?? event.organizerUserId ?? DRY_RUN_ACTOR;
  const input = await loadBackfillInput(tx, event.id, { actorUserId: actor, now: new Date(), thirdPlace: EVENT_SPECS[event.slug]?.thirdPlace });
  const guard = evaluateBackfillGuard(input.existing!);
  if (guard.action === "skip") return { lines: [`  SKIP: ${guard.reason}`], report: { slug: event.slug, name: event.name, status: "skipped", detail: guard.reason } };
  const result: LegacyBackfillResult = planLegacyBackfill(input);
  const actorKnown = actor === DRY_RUN_ACTOR ? false : Boolean(await tx.user.findUnique({ where: { id: actor }, select: { id: true } }));
  const actorLine = actor === DRY_RUN_ACTOR
    ? ["  actor: none given and the event has no organizer; --apply will need --actor-user"]
    : [`  actor ${actor}: ${actorKnown ? "exists" : "NOT FOUND in the user table; --apply would fail"}`];
  const detail = result.ok ? { summary: summarizePlan(result.plan), prediction: result.prediction } : { problems: result.problems };
  return { lines: [...describeBackfillResult(result, input.teams), ...actorLine], report: { slug: event.slug, name: event.name, status: result.ok ? "plan" : "problems", detail } };
}

async function applyEvent(prisma: PrismaClient, event: EventRef, actorUser: string | null): Promise<{ lines: string[]; report: Report }> {
  const actor = actorUser ?? event.organizerUserId;
  if (!actor) throw new Error("no actor: pass --actor-user <user id> (the event has no organizer)");
  const outcome = await prisma.$transaction(async (tx) => {
    const input = await loadBackfillInput(tx, event.id, { actorUserId: actor, now: new Date(), thirdPlace: EVENT_SPECS[event.slug]?.thirdPlace });
    const guard = evaluateBackfillGuard(input.existing!);
    if (guard.action === "skip") return { status: "skipped" as const, reason: guard.reason };
    const result = planLegacyBackfill(input);
    if (!result.ok) throw new BackfillRefused(result.problems);
    return applyLegacyBackfill(tx, result.plan, result.prediction);
  }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (outcome.status === "skipped") return { lines: [`  SKIP: ${outcome.reason}`], report: { slug: event.slug, name: event.name, status: "skipped", detail: outcome.reason } };
  const blockers = outcome.prediction.readiness.blockers.map((blocker) => blocker.code).join(", ") || "none";
  return {
    lines: [`  APPLIED: competition version is now ${outcome.version}; readiness ${outcome.prediction.readiness.ready ? "READY" : `not ready (${blockers})`}`],
    report: { slug: event.slug, name: event.name, status: "applied", detail: { version: outcome.version, prediction: outcome.prediction } },
  };
}

function failure(event: EventRef, error: unknown): { lines: string[]; report: Report } {
  if (error instanceof BackfillRefused) {
    return {
      lines: [`  REFUSED, nothing written (${error.problems.length} problems):`, ...error.problems.map((problem) => `    - ${problem}`)],
      report: { slug: event.slug, name: event.name, status: "problems", detail: { problems: error.problems } },
    };
  }
  const text = error instanceof Error ? error.message : String(error);
  return { lines: [`  ERROR, rolled back: ${text}`], report: { slug: event.slug, name: event.name, status: "error", detail: text } };
}

async function findEvents(prisma: PrismaClient, refs: string[]): Promise<EventRef[]> {
  return prisma.event.findMany({
    where: refs.length ? { OR: refs.flatMap((ref) => [{ id: ref }, { slug: ref }]) } : { slug: { startsWith: "mfl" } },
    select: { id: true, slug: true, name: true, organizerUserId: true },
    orderBy: { createdAt: "asc" },
  });
}

async function runEvents(prisma: PrismaClient, events: EventRef[], apply: boolean, actorUser: string | null): Promise<Report[]> {
  const run = async (event: EventRef, tx: Prisma.TransactionClient | null) => {
    console.log(`\n=== ${event.name}  [${event.slug}]`);
    try {
      const outcome = tx ? await dryRunEvent(tx, event, actorUser) : await applyEvent(prisma, event, actorUser);
      outcome.lines.forEach((line) => console.log(line));
      return outcome.report;
    } catch (error) {
      const outcome = failure(event, error);
      outcome.lines.forEach((line) => console.log(line));
      process.exitCode = 1;
      return outcome.report;
    }
  };
  if (apply) {
    const reports: Report[] = [];
    for (const event of events) reports.push(await run(event, null));
    return reports;
  }
  // Dry run: one READ ONLY transaction. The database itself refuses any write below.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const reports: Report[] = [];
    for (const event of events) reports.push(await run(event, tx));
    return reports;
  }, { ...TRANSACTION_OPTIONS, timeout: 300_000 });
}

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  if (args.errors.length) {
    args.errors.forEach((error) => console.error(error));
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  try {
    console.log(args.apply ? "APPLY: events will be changed." : "DRY RUN: nothing is written (read-only transaction). Add --apply to write.");
    console.log(`database host: ${databaseHost()}`);
    const events = await findEvents(prisma, args.refs);
    if (!events.length) {
      console.log("No events found. Pass slugs or ids as arguments.");
      return;
    }
    const reports = await runEvents(prisma, events, args.apply, args.actorUser);
    if (args.jsonPath) {
      fs.writeFileSync(args.jsonPath, JSON.stringify(reports, null, 2));
      console.log(`\nReport written to ${args.jsonPath}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
