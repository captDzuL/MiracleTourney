"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAnyRole } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { adminWriteMatchPlayerStats, approveStatSubmission, assertUserCanManageEvent, getPlayerStatFormContext, rejectStatSubmission } from "@/lib/platform/repository";
import { parsePlayerStatForm, validatePlayerStatPayload } from "@/lib/player-stats/form";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { safeEntityIdSchema } from "@/lib/security/request-guard";

export type PlayerStatsActionResult = { status: "saved" | "conflict" | "invalid" | "unauthorized" | "failed" };
const identifier = z.string().trim().min(1).max(300);
const entityId = safeEntityIdSchema;
const version = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number).refine(Number.isSafeInteger);
const baseSchema = z.object({ locale:z.enum(["id","en"]),eventId:entityId,matchId:identifier,expectedVersion:version,expectedResultVersion:version,operationId:identifier.max(200) });
async function mutate(formData:FormData, action:"save"|"approve"|"reject"):Promise<PlayerStatsActionResult> {
  const parsed=baseSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return {status:"invalid"};
  const {locale,...guard}=parsed.data;
  const path=`/${locale}/organizer/events/${encodeURIComponent(guard.eventId)}/matches/${encodeURIComponent(guard.matchId)}`;
  try {
    const actor=await requireAnyRole(["organizer","admin","platform_admin"]);
    if(!actor || actor.role==="organizer"&&actor.mustChangePassword || !isFeatureEnabled("organizer_workspace_v3") || !isFeatureEnabled("competition_operations_v3"))return {status:"unauthorized"};
    const access = authorizeWorkspaceResource(
      actor as WorkspaceActor,
      { eventId: guard.eventId, ownerUserId: actor.role === "organizer" ? actor.id : undefined },
      actor.role === "organizer" ? actor.id : null,
    );
    if (!access.ok) return { status: "unauthorized" };
    await assertUserCanManageEvent(actor,guard.eventId);
    if(action==="save"){
      const team=identifier.safeParse(formData.get("teamId"));
      if(!team.success)return {status:"invalid"};
      const context=await getPlayerStatFormContext(guard.matchId,guard.eventId);
      if(context.match.eventId!==guard.eventId||![context.match.homeTeamId,context.match.awayTeamId].includes(team.data))return {status:"invalid"};
      let stats;
      try {
        const options={allowedStatKeys:context.allowedStatKeys,scoreSlotCount:context.scoreGameNumbers?.length??null};
        stats=parsePlayerStatForm(formData,options);validatePlayerStatPayload(stats,options);
      } catch {return {status:"invalid"};}
      await adminWriteMatchPlayerStats({eventId:guard.eventId,matchId:guard.matchId,teamId:team.data,adminId:actor.id,stats,guard});
    }else{
      const submission=identifier.safeParse(formData.get("submissionId"));
      const submittedAt=z.iso.datetime().safeParse(formData.get("submittedAt"));
      const note=z.string().trim().min(1).max(4000).safeParse(formData.get("rejectionNote"));
      if(!submission.success||!submittedAt.success||action==="reject"&&!note.success)return {status:"invalid"};
      const reviewGuard={...guard,submittedAt:submittedAt.data};
      if(action==="approve")await approveStatSubmission(submission.data,actor.id,reviewGuard);
      else await rejectStatSubmission(submission.data,actor.id,note.data!,reviewGuard);
    }
    revalidateTag("stats");revalidateTag("events");revalidatePath(path);
    revalidatePath(`/${locale}/captain/stats`);
    revalidatePath(`/${locale}/organizer/events/${encodeURIComponent(guard.eventId)}/match-control`);
    return {status:"saved"};
  }catch(error){
    const message=error instanceof Error?error.message:"";
    const code=error&&typeof error==="object"&&"code" in error?error.code:undefined;
    if(/conflict|stale|no longer pending/i.test(message)||code==="P2034"){revalidatePath(path);return {status:"conflict"};}
    if(/authorized|password|unavailable/i.test(message))return {status:"unauthorized"};
    if(/invalid|Completed|not found|reason|required|relationship|locks/i.test(message))return {status:"invalid"};
    return {status:"failed"};
  }
}
export async function saveEventPlayerStatsAction(formData:FormData):Promise<PlayerStatsActionResult>{return mutate(formData,"save");}
export async function approveEventPlayerStatsAction(formData:FormData):Promise<PlayerStatsActionResult>{return mutate(formData,"approve");}
export async function rejectEventPlayerStatsAction(formData:FormData):Promise<PlayerStatsActionResult>{return mutate(formData,"reject");}
