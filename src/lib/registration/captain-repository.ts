import { getGameModeConfig } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { buildCaptainCoreRoster, type CaptainCorePlayer } from "@/lib/registration/captain-registration";
import { validateTeamData } from "@/lib/validation/team-data";

export async function saveCaptainRegistrationDraft(input: {
  captainId: string;
  eventId: string;
  draftTeamId?: string;
  teamName: string;
  teamTag: string;
  captainIgn: string;
  captainUid: string;
  captainContact: string;
  captainIsPlayer: boolean;
  players: CaptainCorePlayer[];
}) {
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { id: true, status: true, gameModeId: true },
  });
  if (!event || event.status !== "Published") {
    throw new Error("Event tidak valid atau sudah tidak membuka pendaftaran.");
  }

  const mode = getGameModeConfig(event.gameModeId);
  const roster = buildCaptainCoreRoster({
    captainIgn: input.captainIgn,
    captainUid: input.captainUid,
    captainIsPlayer: input.captainIsPlayer,
    requiredPlayers: mode.teamSize,
    players: input.players,
  });
  const teamName = input.teamName.trim();
  const teamTag = input.teamTag.trim().toUpperCase();
  const captainContact = input.captainContact.trim();

  const dataErrors = validateTeamData({
    teamName,
    teamTag,
    captainName: input.captainIgn,
    captainContact,
  });
  if (dataErrors.length) throw new Error(dataErrors.map((error) => error.message).join(". "));

  const eventPlayers = await prisma.player.findMany({
    where: { eventId: input.eventId },
    select: { displayName: true },
  });
  const registeredUids = new Set(eventPlayers.map((player) => player.displayName.trim().toLocaleLowerCase()));
  const duplicateUid = roster.find((player) => registeredUids.has(player.uid.toLocaleLowerCase()));
  if (duplicateUid) {
    throw new Error(`UID ${duplicateUid.uid} sudah terdaftar pada tim lain di event ini.`);
  }

  const existingDraft = input.draftTeamId
    ? await prisma.team.findFirst({ where: { id: input.draftTeamId, captainId: input.captainId, eventId: null, source: "draft" }, select: { id: true } })
    : await prisma.team.findFirst({ where: { captainId: input.captainId, eventId: null, source: "draft" }, select: { id: true } });

  return prisma.$transaction(async (tx) => {
    const teamData = {
      captainId: input.captainId,
      captainName: input.captainIgn.trim(),
      captainContact,
      captainIgn: input.captainIgn.trim(),
      captainUid: input.captainUid.trim(),
      captainIsPlayer: input.captainIsPlayer,
      name: teamName,
      tag: teamTag,
      logoText: teamTag.slice(0, 2),
      source: "draft",
    };
    const team = existingDraft
      ? await tx.team.update({ where: { id: existingDraft.id }, data: teamData })
      : await tx.team.create({ data: { ...teamData, eventId: null } });

    await tx.player.deleteMany({ where: { teamId: team.id } });
    await tx.player.createMany({
      data: roster.map((player) => ({
        teamId: team.id,
        displayName: player.uid,
        nickname: player.ign,
        position: player.position,
      })),
    });
    return team.id;
  });
}
