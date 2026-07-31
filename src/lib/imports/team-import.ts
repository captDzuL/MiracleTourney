import { getEvents, importTeams } from "../platform/demo-store";
import type { Event, Team } from "../platform/types";

export type TeamImportRow = {
  eventSlug: string;
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact: string;
};

export type TeamImportError = {
  rowNumber: number;
  message: string;
};

const requiredHeaders = [
  "event_slug",
  "team_name",
  "captain_name",
  "captain_contact",
] as const;

const optionalHeaders = ["team_tag"] as const;
const supportedHeaders = [...requiredHeaders, ...optionalHeaders];

export function buildTeamTag(teamName: string) {
  return (
    teamName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || teamName.slice(0, 2).toUpperCase()
  );
}

export function parseTeamImportCsv(csvText: string): TeamImportRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(",").map((header) => header.trim());

  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required CSV column "${header}"`);
    }
  }

  const unsupportedHeaders = headers.filter((header) => !supportedHeaders.includes(header as never));
  if (unsupportedHeaders.length > 0) {
    throw new Error(`Unsupported CSV columns: ${unsupportedHeaders.join(", ")}`);
  }

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const getValue = (header: string) => {
      const index = headers.indexOf(header);
      return index >= 0 ? (cells[index] ?? "") : "";
    };

    const teamName = getValue("team_name");
    const rawTeamTag = getValue("team_tag");

    return {
      eventSlug: getValue("event_slug"),
      teamName,
      teamTag: rawTeamTag || buildTeamTag(teamName),
      captainName: getValue("captain_name"),
      captainContact: getValue("captain_contact"),
    };
  });
}

export function validateTeamImportRows(
  rows: TeamImportRow[],
  events: Event[],
  teams: Team[],
) {
  const errors: TeamImportError[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const event = events.find((item) => item.slug === row.eventSlug);

    if (!event) {
      errors.push({
        rowNumber,
        message: `Row ${rowNumber}: event_slug "${row.eventSlug}" was not found`,
      });
      return;
    }

    if (!row.teamName) {
      errors.push({ rowNumber, message: `Row ${rowNumber}: team_name is required` });
    }

    if (!row.captainName) {
      errors.push({ rowNumber, message: `Row ${rowNumber}: captain_name is required` });
    }

    if (!row.captainContact) {
      errors.push({ rowNumber, message: `Row ${rowNumber}: captain_contact is required` });
    }

    const key = `${event.id}::${row.teamName.toLowerCase()}`;
    const duplicateExists = teams.some(
      (team) =>
        team.eventId === event.id &&
        team.name.toLowerCase() === row.teamName.toLowerCase(),
    );

    if (seenKeys.has(key) || duplicateExists) {
      errors.push({
        rowNumber,
        message: `Row ${rowNumber}: team_name "${row.teamName}" is already registered for event "${row.eventSlug}"`,
      });
    }

    seenKeys.add(key);
  });

  return errors;
}

export function importTeamsFromRows(rows: TeamImportRow[]) {
  const events = getEvents();
  const importedTeams: Team[] = rows.map((row, index) => {
    const event = events.find((item) => item.slug === row.eventSlug)!;

    return {
      id: `team-${event.slug}-${Date.now()}-${index}`,
      eventId: event.id,
      captainId: `imported-${event.id}-${index}`,
      name: row.teamName,
      logoText: row.teamTag.slice(0, 2).toUpperCase(),
      tag: row.teamTag.toUpperCase(),
      captainName: row.captainName,
      captainContact: row.captainContact,
    };
  });

  return importTeams(importedTeams);
}
