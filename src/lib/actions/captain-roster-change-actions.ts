"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { getCaptainOrTeamOwner } from "@/lib/auth/captain-access";
import {
  cancelRosterChangeRequest,
  requestRosterChange,
  RosterChangeError,
  type RosterChange,
} from "@/lib/platform/roster-change-requests";
import { checkRateLimit } from "@/lib/rate-limit";
import { safeEntityIdSchema } from "@/lib/security/request-guard";

const ROSTER_TAB = "/captain?tab=roster";
const RATE_LIMIT_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const playerFields = {
  displayName: z.string().trim().min(2).max(40),
  nickname: z.string().trim().min(2).max(40),
  position: z.string().trim().max(40).default(""),
};

const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("swap"), teamId: safeEntityIdSchema, outPlayerId: safeEntityIdSchema, ...playerFields }),
  z.object({ kind: z.literal("add"), teamId: safeEntityIdSchema, ...playerFields }),
  z.object({ kind: z.literal("remove"), teamId: safeEntityIdSchema, outPlayerId: safeEntityIdSchema }),
]);

function fieldText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function toChange(parsed: z.infer<typeof requestSchema>): RosterChange {
  if (parsed.kind === "remove") return { kind: "remove", outPlayerId: parsed.outPlayerId };
  const incoming = { displayName: parsed.displayName, nickname: parsed.nickname, position: parsed.position };
  return parsed.kind === "swap"
    ? { kind: "swap", outPlayerId: parsed.outPlayerId, incoming }
    : { kind: "add", incoming };
}

/** A captain, or a player who captains a solo team. The service still checks that the team is theirs. */
async function captainOrLogin() {
  const captain = await getCaptainOrTeamOwner();
  if (!captain) return redirectToActiveLocale("/login");
  return captain;
}

/** Wording for a refused request. Unexpected errors never reach the captain. */
async function messageFor(error: unknown): Promise<string> {
  const t = await getTranslations("captain");
  if (error instanceof RosterChangeError) return t(`rosterChange.error.${error.code}`);
  console.error("Roster change failed", { name: error instanceof Error ? error.name : "unknown" });
  return t("rosterChange.error.unknown");
}

/** One budget per captain for filing and cancelling, so rotating the team id buys nothing. */
function withinRateLimit(captainId: string): Promise<boolean> {
  return checkRateLimit(`roster-change:${captainId}`, RATE_LIMIT_ATTEMPTS, RATE_LIMIT_WINDOW_MS);
}

function backToRoster(outcome: { success: string } | { error: string }): Promise<never> {
  const query = "success" in outcome ? `success=${outcome.success}` : `error=${encodeURIComponent(outcome.error)}`;
  return redirectToActiveLocale(`${ROSTER_TAB}&${query}`);
}

/** The captain asks the organizer to change the roster. Nothing changes until it is approved. */
export async function captainRequestRosterChangeAction(formData: FormData): Promise<never> {
  const captain = await captainOrLogin();

  const parsed = requestSchema.safeParse({
    kind: fieldText(formData, "kind"),
    teamId: fieldText(formData, "teamId"),
    outPlayerId: fieldText(formData, "outPlayerId"),
    displayName: fieldText(formData, "displayName"),
    nickname: fieldText(formData, "nickname"),
    position: fieldText(formData, "position"),
  });
  if (!parsed.success) return backToRoster({ error: await messageFor(new RosterChangeError("invalid_change")) });

  if (!(await withinRateLimit(captain.id))) return backToRoster({ error: await messageFor(new RosterChangeError("rate_limited")) });

  let failure: string | null = null;
  try {
    await requestRosterChange({ captainId: captain.id, teamId: parsed.data.teamId, change: toChange(parsed.data) });
  } catch (error) {
    failure = await messageFor(error);
  }
  if (failure) return backToRoster({ error: failure });

  revalidatePath("/captain");
  return backToRoster({ success: "roster-change-requested" });
}

export async function captainCancelRosterChangeAction(formData: FormData): Promise<never> {
  const captain = await captainOrLogin();

  const requestId = safeEntityIdSchema.safeParse(fieldText(formData, "requestId"));
  if (!requestId.success) return backToRoster({ error: await messageFor(new RosterChangeError("request_not_found")) });
  if (!(await withinRateLimit(captain.id))) return backToRoster({ error: await messageFor(new RosterChangeError("rate_limited")) });

  let failure: string | null = null;
  try {
    await cancelRosterChangeRequest({ captainId: captain.id, requestId: requestId.data });
  } catch (error) {
    failure = await messageFor(error);
  }
  if (failure) return backToRoster({ error: failure });

  revalidatePath("/captain");
  return backToRoster({ success: "roster-change-cancelled" });
}
