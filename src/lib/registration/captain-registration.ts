export type CaptainCorePlayer = {
  ign: string;
  uid: string;
  position?: string;
};

export type CaptainCoreRosterInput = {
  captainIgn: string;
  captainUid: string;
  captainIsPlayer: boolean;
  requiredPlayers: number;
  players: CaptainCorePlayer[];
};

export function buildCaptainCoreRoster(input: CaptainCoreRosterInput): Required<CaptainCorePlayer>[] {
  const captainIgn = input.captainIgn.trim();
  const captainUid = input.captainUid.trim();
  if (captainIgn.length < 2 || captainUid.length < 2) {
    throw new Error("IGN dan UID kapten wajib diisi.");
  }

  const players = input.players.map((player) => ({
    ign: player.ign.trim(),
    uid: player.uid.trim(),
    position: player.position?.trim() ?? "",
  }));

  if (players.some((player) => player.ign.length < 2 || player.uid.length < 2)) {
    throw new Error("IGN dan UID setiap pemain wajib diisi.");
  }

  const roster = input.captainIsPlayer
    ? [{ ign: captainIgn, uid: captainUid, position: "Captain" }, ...players]
    : players;

  if (roster.length !== input.requiredPlayers) {
    throw new Error(`Roster inti harus berisi ${input.requiredPlayers} pemain.`);
  }

  const normalizedUids = roster.map((player) => player.uid.toLocaleLowerCase());
  if (new Set(normalizedUids).size !== normalizedUids.length) {
    throw new Error("UID setiap pemain harus unik.");
  }

  return roster;
}
