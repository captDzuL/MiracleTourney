// Authorization checks shared by the platform repositories. Moved out of repository.ts without changes (refactor PR 1.2).

import { prisma } from "../db";
import type { AppUser } from "@/lib/platform/types";

export async function assertUserCanManageEvent(user: AppUser, eventId: string): Promise<void> {
  if (user.role === "platform_admin" || user.role === "admin") return;
  if (user.role !== "organizer") throw new Error("Not authorized");

  const row = await prisma.event.findFirst({
    where: { id: eventId, organizerUserId: user.id },
    select: { id: true },
  });
  if (!row) throw new Error("Not authorized");
}

export async function assertUserCanReviewStatSubmission(user: AppUser, submissionId: string): Promise<void> {
  if (user.role === "platform_admin" || user.role === "admin") return;
  if (user.role !== "organizer") throw new Error("Not authorized");

  const row = await prisma.statSubmission.findFirst({
    where: { id: submissionId, status: "pending", event: { organizerUserId: user.id } },
    select: { id: true },
  });
  if (!row) throw new Error("Not authorized");
}

export async function assertUserCanManageTeam(user: AppUser, teamId: string): Promise<{ eventId: string }> {
  const team = await prisma.team.findFirst({
    where: { id: teamId },
    select: { id: true, eventId: true },
  });

  if (!team?.eventId) throw new Error("Not authorized");
  await assertUserCanManageEvent(user, team.eventId);
  return { eventId: team.eventId };
}
