import type { Prisma, PrismaClient } from "@prisma/client";

export const PRODUCTION_CLEANUP_CONFIRM_FLAG = "--confirm-production-cleanup";
export const PUBLIC_EVENT_LIST_FLAG = "--list-public-events";

export const DUMMY_EVENT_TARGET_WHERE = {
  OR: [
    { slug: "miracle-league" },
    { name: "Miracle Fast Tour" },
    { slug: { startsWith: "admin-stats-e2e" } },
    { slug: { startsWith: "admin-stats-nav-e2e" } },
    { name: "Admin Stats E2E" },
    { slug: { startsWith: "admin-match-e2e" } },
    { name: "Admin Match E2E" },
    { slug: { in: ["flashpeak-mid-season-cup", "flash-peak-mid-season-cup", "FP-MID-SEASON"] } },
    { name: { in: ["Flash peak Mid Season Cup", "Flashpeak Mid-Season Cup", "Flash Peak Mid Season Cup"] } },
  ],
} satisfies Prisma.EventWhereInput;

export type DummyEventTarget = Awaited<ReturnType<typeof listDummyEventTargets>>[number];

export function hasProductionCleanupConfirmation(args: string[]) {
  return args.includes(PRODUCTION_CLEANUP_CONFIRM_FLAG);
}

export function hasPublicEventListRequest(args: string[]) {
  return args.includes(PUBLIC_EVENT_LIST_FLAG);
}

export function sanitizeDatabaseTarget(databaseUrl: string | undefined) {
  if (!databaseUrl) return { protocol: "unknown", host: "unknown", database: "unknown" };

  try {
    const url = new URL(databaseUrl);
    return {
      protocol: url.protocol,
      host: url.hostname,
      database: url.pathname.replace(/^\//, "") || "unknown",
    };
  } catch {
    return { protocol: "unknown", host: "unknown", database: "unknown" };
  }
}

const PUBLIC_EVENT_STATUSES = ["Published", "Registration Closed", "Ongoing", "Finished"];

export async function listProductionPublicEvents(prisma: PrismaClient) {
  return prisma.event.findMany({
    where: { status: { in: PUBLIC_EVENT_STATUSES } },
    orderBy: [{ createdAt: "desc" }, { slug: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      startsAt: true,
      venue: true,
      createdAt: true,
      _count: {
        select: {
          matches: true,
          teams: true,
        },
      },
    },
  });
}

export async function listDummyEventTargets(prisma: PrismaClient) {
  return prisma.event.findMany({
    where: DUMMY_EVENT_TARGET_WHERE,
    orderBy: [{ createdAt: "desc" }, { slug: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      createdAt: true,
      certificate: {
        select: { id: true },
      },
      _count: {
        select: {
          matches: true,
          statSubmissions: true,
          teams: true,
        },
      },
    },
  });
}

export async function deleteDummyEventTargets(prisma: PrismaClient) {
  const targets = await listDummyEventTargets(prisma);
  const targetIds = targets.map((event) => event.id);
  if (targetIds.length === 0) {
    return { targets, deletedCertificates: 0, deletedEvents: 0 };
  }

  const [certificateResult, eventResult] = await prisma.$transaction([
    prisma.certificate.deleteMany({ where: { eventId: { in: targetIds } } }),
    prisma.event.deleteMany({ where: { id: { in: targetIds } } }),
  ]);

  return {
    targets,
    deletedCertificates: certificateResult.count,
    deletedEvents: eventResult.count,
  };
}
