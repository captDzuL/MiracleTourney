import { findGameModeConfig } from "@/lib/platform/config";

/**
 * Roster size a public event page tells captains about. The minimum is the team size of the game mode: the same number
 * the registration form, the import and roster changes require. A mode the app does not know gives 1 and 1.
 */
export function getRosterLimits(gameModeId: string | null | undefined): { minimumRoster: number; maximumRoster: number } {
  const mode = gameModeId ? findGameModeConfig(gameModeId) : undefined;
  return { minimumRoster: mode?.teamSize ?? 1, maximumRoster: mode?.maxRosterSize ?? 1 };
}
