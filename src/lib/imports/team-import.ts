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

export type ParsedTeamImportCsv = {
  rows: TeamImportRow[];
  errors: TeamImportError[];
};

export type DemoStateLike = {
  events: Event[];
  teams: Team[];
};

export type ParseResult =
  | {
      ok: true;
      rows: TeamImportRow[];
    }
  | {
      ok: false;
      errors: string[];
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

function buildHeaderErrors(headers: string[]) {
  const errors: TeamImportError[] = [];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  const unsupportedHeaders = headers.filter(
    (header) => !supportedHeaders.includes(header as never),
  );

  if (missingHeaders.length > 0) {
    errors.push({
      rowNumber: 1,
      message: `Row 1: missing required CSV columns: ${missingHeaders.join(", ")}`,
    });
  }

  if (unsupportedHeaders.length > 0) {
    errors.push({
      rowNumber: 1,
      message: `Row 1: unsupported CSV columns: ${unsupportedHeaders.join(", ")}`,
    });
  }

  return errors;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (inQuotes) {
    return { cells: [], error: "has an unmatched quote" };
  }

  cells.push(current.trim());
  return { cells, error: null as string | null };
}

export function parseTeamImportCsv(csvText: string): ParsedTeamImportCsv {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], errors: [] };
  }

  const parsedHeader = parseCsvLine(lines[0]);
  if (parsedHeader.error) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: `Row 1: ${parsedHeader.error}` }],
    };
  }

  const headers = parsedHeader.cells;
  const headerErrors = buildHeaderErrors(headers);
  const rows: TeamImportRow[] = [];
  const errors: TeamImportError[] = [...headerErrors];

  if (headerErrors.length > 0) {
    return { rows, errors };
  }

  for (const [index, line] of lines.slice(1).entries()) {
    const rowNumber = index + 2;
    const parsedRow = parseCsvLine(line);

    if (parsedRow.error) {
      errors.push({
        rowNumber,
        message: `Row ${rowNumber}: ${parsedRow.error}`,
      });
      continue;
    }

    if (parsedRow.cells.length !== headers.length) {
      errors.push({
        rowNumber,
        message: `Row ${rowNumber}: expected ${headers.length} columns but found ${parsedRow.cells.length}`,
      });
      continue;
    }

    const getValue = (header: string) => {
      const headerIndex = headers.indexOf(header);
      return headerIndex >= 0 ? (parsedRow.cells[headerIndex] ?? "") : "";
    };

    const teamName = getValue("team_name");
    const rawTeamTag = getValue("team_tag");

    rows.push({
      eventSlug: getValue("event_slug"),
      teamName,
      teamTag: rawTeamTag || buildTeamTag(teamName),
      captainName: getValue("captain_name"),
      captainContact: getValue("captain_contact"),
    });
  }

  return { rows, errors };
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

export function parseAndValidateTeamImport(
  csvText: string,
  storeSnapshot: DemoStateLike,
): ParseResult {
  const parsed = parseTeamImportCsv(csvText);
  const errors = [
    ...parsed.errors,
    ...validateTeamImportRows(parsed.rows, storeSnapshot.events, storeSnapshot.teams),
  ];

  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors.map((error) => error.message),
    };
  }

  return {
    ok: true,
    rows: parsed.rows,
  };
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
