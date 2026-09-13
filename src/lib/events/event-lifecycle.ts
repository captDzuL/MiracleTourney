import type { Prisma } from "@prisma/client";

export async function applyEventLifecycleSideEffects(
  tx: Pick<Prisma.TransactionClient, "eventEditRevision" | "eventPreviewToken">,
  eventId: string,
  status: string,
  now: Date,
): Promise<void> {
  if (status === "Ongoing" || status === "Finished") {
    await tx.eventEditRevision.updateMany({
      where: { eventId, status: "Draft" },
      data: {
        status: "Discarded",
        discardedAt: now,
        discardReason: status === "Finished" ? "event_finished" : "event_started",
      },
    });
  }
  await tx.eventPreviewToken.updateMany({
    where: { eventId, revokedAt: null },
    data: { revokedAt: now },
  });
}
