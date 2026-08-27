import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PAID_TAGS = ["BTR2", "BTRS", "TBG", "TB4", "BRA", "FLC"];
const PENDING_TAGS = ["KFC", "HX", "AOC", "AVO", "ATL", "ACE", "BRO", "TBI"];
const ALL_TAGS = [...PAID_TAGS, ...PENDING_TAGS];

async function main() {
  const teams = await prisma.team.findMany({
    where: { tag: { in: ALL_TAGS } },
    select: {
      id: true, tag: true, name: true, eventId: true, captainId: true,
      event: { select: { id: true, slug: true, name: true, registrationFeeRequired: true } },
      registrationRequest: { select: { id: true, status: true } },
    },
    orderBy: { tag: "asc" },
  });

  console.log(`Found ${teams.length} teams matching tags out of ${ALL_TAGS.length} expected.\n`);

  const byEvent = new Map();
  for (const t of teams) {
    const key = t.eventId;
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key).push(t);
  }

  for (const [eventId, list] of byEvent) {
    const ev = list[0].event;
    console.log(`Event: ${ev.name} (${ev.slug}, id=${eventId}, registrationFeeRequired=${ev.registrationFeeRequired})`);
    for (const t of list) {
      console.log(`  ${t.tag.padEnd(6)} ${t.name.padEnd(30)} captainId=${t.captainId ?? "NULL"} existingRequest=${t.registrationRequest ? t.registrationRequest.status : "none"}`);
    }
    console.log("");
  }

  const foundTags = new Set(teams.map((t) => t.tag));
  const missing = ALL_TAGS.filter((tag) => !foundTags.has(tag));
  if (missing.length) {
    console.log("MISSING tags (not found as Team.tag anywhere):", missing.join(", "));
  }

  const noCaptain = teams.filter((t) => !t.captainId);
  if (noCaptain.length) {
    console.log("WARNING: teams with no captainId (request requires captainId):", noCaptain.map((t) => t.tag).join(", "));
  }
}

main().finally(() => prisma.$disconnect());
