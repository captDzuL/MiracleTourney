import { PrismaClient } from "@prisma/client";
import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadE2eEnvironment } from "./e2e-env.mjs";
import { validateE2eDatabaseConfiguration } from "./e2e-db-configuration.mjs";

export const REQUIRED_FIXTURES = [
  ["flashpeak-revision-published", "Published", false],
  ["flashpeak-revision-closed", "Registration Closed", true],
  ["flashpeak-rising-64", "Ongoing", true],
  ["flashpeak-champions-32", "Finished", true],
];

export async function checkPublicFixtures({ env = process.env, Prisma = PrismaClient, checkAsset = access } = {}) {
  const guard = validateE2eDatabaseConfiguration(env);
  if (!guard.ok) throw new Error("Guarded test database configuration is invalid.");
  const prisma = new Prisma();
  try {
    const events = await prisma.event.findMany({ where: { slug: { in: REQUIRED_FIXTURES.map(([slug]) => slug) } }, select: { id: true, slug: true, status: true, competitionVersion: true, competitionPhases: { where: { status: { in: ["active", "completed"] } }, select: { id: true } } } });
    for (const [slug, status, phase] of REQUIRED_FIXTURES) {
      const event = events.find((item) => item.slug === slug);
      if (!event || event.status !== status || !Number.isInteger(event.competitionVersion) || event.competitionPhases.length !== (phase ? 1 : 0)) throw new Error(`Required public fixture ${slug} is missing or incompatible.`);
    }
    await checkAsset("public/game-backgrounds/flashpeak.svg");
    return { slugs: REQUIRED_FIXTURES.map(([slug]) => slug), count: events.length };
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { loadE2eEnvironment(); const result = await checkPublicFixtures(); console.log(`[public-v3-fixtures] verified ${result.count} fixture states and local asset`); }
  catch { console.error("[public-v3-fixtures] Required read-only fixture/schema/client check failed."); process.exitCode = 1; }
}
