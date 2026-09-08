import type { ActorContext } from "@/modules/identity";

import type { Player, Team } from "@/lib/platform/types";

import {
  addPlayer as addPlayerInRepository,
  assertCaptainCanManageTeam as assertCaptainCanManageTeamInRepository,
  assertActorCanManageTeam as assertActorCanManageTeamInRepository,
  assignCaptainForActor as assignCaptainForActorInRepository,
  deletePlayer as deletePlayerInRepository,
  deleteTeamForActor as deleteTeamForActorInRepository,
  setTeamCaptainDisplay as setTeamCaptainDisplayInRepository,
  updateCaptainTeamLogo as updateCaptainTeamLogoInRepository,
  updatePlayer as updatePlayerInRepository,
  updateTeamLogoForActor as updateTeamLogoForActorInRepository,
} from "./repository";
import type { AddPlayerInput } from "./repository";

/**
 * Public preflight authorization check. Lets Server Actions deny access to
 * another tenant's team *before* performing side effects (such as uploading
 * a file to Blob storage) that a mutation's own transactional ownership
 * check cannot undo. This is a preflight only — every mutation still
 * re-verifies ownership at its own write, so denial never rests solely on
 * this earlier check.
 */
export async function assertActorCanManageTeam(actor: ActorContext | null, teamId: string): Promise<{ eventId: string }> {
  return assertActorCanManageTeamInRepository(actor, teamId);
}

export async function assignCaptainForActor(
  actor: ActorContext | null,
  teamId: string,
  captainUserId: string | null,
): Promise<Team> {
  return assignCaptainForActorInRepository(actor, teamId, captainUserId);
}

export async function deleteTeamForActor(actor: ActorContext | null, teamId: string): Promise<void> {
  return deleteTeamForActorInRepository(actor, teamId);
}

export async function updateTeamLogoForActor(actor: ActorContext | null, teamId: string, logoUrl: string): Promise<Team> {
  return updateTeamLogoForActorInRepository(actor, teamId, logoUrl);
}

export async function assertCaptainCanManageTeam(captainUserId: string, teamId: string): Promise<{ eventId?: string }> {
  return assertCaptainCanManageTeamInRepository(captainUserId, teamId);
}

export async function updateCaptainTeamLogo(captainUserId: string, teamId: string, logoUrl: string): Promise<Team> {
  return updateCaptainTeamLogoInRepository(captainUserId, teamId, logoUrl);
}

export async function addPlayer(captainUserId: string, input: AddPlayerInput): Promise<Player> {
  return addPlayerInRepository(captainUserId, input);
}

export async function updatePlayer(
  id: string,
  captainUserId: string,
  data: { displayName?: string; nickname?: string; position?: string; jerseyNumber?: number | null },
): Promise<Player> {
  return updatePlayerInRepository(id, captainUserId, data);
}

export async function deletePlayer(id: string, captainUserId: string): Promise<void> {
  return deletePlayerInRepository(id, captainUserId);
}

export async function setTeamCaptainDisplay(teamId: string, captainUserId: string, playerId: string): Promise<void> {
  return setTeamCaptainDisplayInRepository(teamId, captainUserId, playerId);
}

