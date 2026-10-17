import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/platform/db";
import { UserFacingError } from "@/lib/security/public-error";

export type Tx = Prisma.TransactionClient;

/**
 * Runs `run` while holding the event's row. Every write that changes who holds a slot, or who is in
 * which team, goes through here, so the writes for one event take turns instead of racing: each one
 * reads the state after the previous one has committed. Serializable transactions would also stay
 * correct, but under a burst of sign-ups they fail each other and players would see random
 * "try again" errors.
 */
export async function withEventLock<T>(
  eventId: string,
  run: (tx: Tx) => Promise<T>,
  options: Readonly<{ timeoutMs?: number }> = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.event.updateMany({ where: { id: eventId }, data: { updatedAt: new Date() } });
      if (locked.count !== 1) throw new UserFacingError("Event tidak ditemukan.");
      return run(tx);
    },
    { maxWait: 15_000, timeout: options.timeoutMs ?? 30_000 },
  );
}
