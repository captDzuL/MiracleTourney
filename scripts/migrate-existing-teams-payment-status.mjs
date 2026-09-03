import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EVENT_ID = "cmt6ob8su0001l404fkjlltbk"; // Flash Peak MFL S2 (mfl-blitz-s2)
const PAID_TAGS = ["BTR2", "BTRS", "TBG", "TB4", "BRA", "FLC"];
const PENDING_TAGS = ["KFC", "HX", "AOC", "AVO", "ATL", "ACE", "BRO", "TBI"];
const PAYMENT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

const DRY_RUN = !process.argv.includes("--execute");

async function main() {
  const teams = await prisma.team.findMany({
    where: { eventId: EVENT_ID, tag: { in: [...PAID_TAGS, ...PENDING_TAGS] } },
    select: { id: true, tag: true, name: true, captainId: true, registrationRequest: { select: { id: true } } },
  });
  const byTag = new Map(teams.map((t) => [t.tag, t]));

  const plan = [];
  for (const tag of PAID_TAGS) {
    const t = byTag.get(tag);
    if (!t) { console.error(`SKIP: paid team tag ${tag} not found in event`); continue; }
    if (t.registrationRequest) { console.error(`SKIP: ${tag} already has a registration request`); continue; }
    if (!t.captainId) { console.error(`SKIP: ${tag} has no captainId, cannot create request`); continue; }
    plan.push({
      tag, teamId: t.id, teamName: t.name, captainId: t.captainId,
      status: "approved",
      expiresAt: new Date(),
      approvedAt: new Date(),
    });
  }
  for (const tag of PENDING_TAGS) {
    const t = byTag.get(tag);
    if (!t) { console.error(`SKIP: pending team tag ${tag} not found in event`); continue; }
    if (t.registrationRequest) { console.error(`SKIP: ${tag} already has a registration request`); continue; }
    if (!t.captainId) { console.error(`SKIP: ${tag} has no captainId, cannot create request`); continue; }
    plan.push({
      tag, teamId: t.id, teamName: t.name, captainId: t.captainId,
      status: "pending_payment",
      expiresAt: new Date(Date.now() + PAYMENT_REQUEST_TTL_MS),
      approvedAt: null,
    });
  }

  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Plan: ${plan.length} TeamRegistrationRequest rows to create\n`);
  for (const p of plan) {
    console.log(`  ${p.tag.padEnd(6)} ${p.teamName.padEnd(28)} -> status=${p.status}${p.status === "pending_payment" ? ` expiresAt=${p.expiresAt.toISOString()}` : ""}`);
  }

  if (DRY_RUN) {
    console.log("\nDry run only. Re-run with --execute to write to the database.");
    return;
  }

  for (const p of plan) {
    await prisma.teamRegistrationRequest.create({
      data: {
        eventId: EVENT_ID,
        captainId: p.captainId,
        teamId: p.teamId,
        teamName: p.teamName,
        teamTag: p.tag,
        status: p.status,
        expiresAt: p.expiresAt,
        approvedAt: p.approvedAt,
      },
    });
    console.log(`Created request for ${p.tag} (${p.status})`);
  }
  console.log(`\nDone. Created ${plan.length} TeamRegistrationRequest rows.`);
}

main().finally(() => prisma.$disconnect());
