type ImportSnapshot = {
  events: Array<{ id: string; slug: string; participantCap: number; bracketLocked: boolean }>;
  teams: Array<{ eventId: string; name: string; tag: string }>;
};

type ImportRow = {
  eventId: string;
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact: string;
  captainEmail?: string;
};

type ImportSuccess = {
  ok: true;
  rows: ImportRow[];
};

type ImportFailure = {
  ok: false;
  message: string;
};

export type ParseTeamImportResult = ImportSuccess | ImportFailure;

const REQUIRED_HEADERS = [
  "event_slug",
  "team_name",
  "team_tag",
  "captain_name",
  "captain_contact",
] as const;

const OPTIONAL_HEADERS = ["captain_email"] as const;
const MAX_IMPORT_ROWS = 512;

function fail(message: string): ImportFailure {
  return { ok: false, message };
}

function hasSpreadsheetFormulaPayload(value: string) {
  return /^[=+\-@]/.test(value.trimStart());
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

type RowError = { row: number; field: string; message: string };

export function parseAndValidateTeamImport(csvText: string, snapshot: ImportSnapshot): ParseTeamImportResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return fail("CSV harus memiliki baris header dan setidaknya satu baris tim.");
  }
  if (lines.length - 1 > MAX_IMPORT_ROWS) {
    return fail(`CSV memiliki terlalu banyak baris. Maksimal impor adalah ${MAX_IMPORT_ROWS} baris tim.`);
  }

  const headers = parseCsvLine(lines[0].replace(/^﻿/, ""));

  const hasOptionalEmail = headers.length === REQUIRED_HEADERS.length + 1 &&
    headers[REQUIRED_HEADERS.length] === OPTIONAL_HEADERS[0];

  if (
    (headers.length !== REQUIRED_HEADERS.length && !hasOptionalEmail) ||
    REQUIRED_HEADERS.some((h, i) => headers[i] !== h)
  ) {
    return fail(
      `Header CSV harus dimulai dengan: ${REQUIRED_HEADERS.join(", ")} (kolom opsional: captain_email)`,
    );
  }

  const eventsBySlug = new Map(snapshot.events.map((event) => [event.slug, event]));
  const existingTags = new Set(snapshot.teams.map((team) => `${team.eventId}::${team.tag.toUpperCase()}`));
  const existingNames = new Set(snapshot.teams.map((team) => `${team.eventId}::${team.name.trim().toLowerCase()}`));
  const existingTeamCounts = new Map<string, number>();
  for (const team of snapshot.teams) {
    existingTeamCounts.set(team.eventId, (existingTeamCounts.get(team.eventId) ?? 0) + 1);
  }
  const stagedTeamCounts = new Map<string, number>();
  const stagedTags = new Set<string>();
  const stagedNames = new Set<string>();
  const errors: RowError[] = [];
  const rows: ImportRow[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const rowNumber = index + 1;
    const values = parseCsvLine(lines[index]);

    const expectedColumns = hasOptionalEmail ? REQUIRED_HEADERS.length + 1 : REQUIRED_HEADERS.length;
    if (values.length !== expectedColumns) {
      errors.push({ row: rowNumber, field: "baris", message: `Diharapkan ${expectedColumns} kolom, diterima ${values.length}.` });
      continue;
    }

    const [eventSlug, teamName, teamTagRaw, captainName, captainContact, captainEmailRaw] = values;
    const captainEmail = captainEmailRaw?.trim() || undefined;

    let rowValid = true;

    // Empty required field checks
    if (!eventSlug) {
      errors.push({ row: rowNumber, field: "event_slug", message: "Kolom event_slug tidak boleh kosong." });
      rowValid = false;
    }
    if (!teamName) {
      errors.push({ row: rowNumber, field: "team_name", message: "Kolom team_name tidak boleh kosong." });
      rowValid = false;
    }
    if (!teamTagRaw) {
      errors.push({ row: rowNumber, field: "team_tag", message: "Kolom team_tag tidak boleh kosong." });
      rowValid = false;
    }
    if (!captainName) {
      errors.push({ row: rowNumber, field: "captain_name", message: "Kolom captain_name tidak boleh kosong." });
      rowValid = false;
    }
    if (!captainContact) {
      errors.push({ row: rowNumber, field: "captain_contact", message: "Kolom captain_contact tidak boleh kosong." });
      rowValid = false;
    }

    // Formula injection checks
    for (const [field, value] of [
      ["team_name", teamName],
      ["team_tag", teamTagRaw],
      ["captain_name", captainName],
      ["captain_contact", captainContact],
      ["captain_email", captainEmail ?? ""],
    ] as const) {
      if (value && hasSpreadsheetFormulaPayload(value)) {
        errors.push({ row: rowNumber, field, message: `Kolom ${field} tidak boleh diawali karakter formula spreadsheet (=, +, -, @).` });
        rowValid = false;
      }
    }

    // If required fields are missing we can't do event or duplicate checks
    if (!eventSlug || !teamName || !teamTagRaw) {
      continue;
    }

    const event = eventsBySlug.get(eventSlug);
    if (!event) {
      errors.push({ row: rowNumber, field: "event_slug", message: `Event dengan slug "${eventSlug}" tidak ditemukan.` });
      rowValid = false;
      continue;
    }

    // bracketLocked is a file-level safety check: abort the entire import
    if (event.bracketLocked) {
      return fail(`Event "${eventSlug}" sudah memiliki hasil pertandingan yang tercatat, sehingga tim tambahan tidak dapat diimpor.`);
    }

    const teamTag = teamTagRaw.toUpperCase();
    const duplicateTagKey = `${event.id}::${teamTag}`;
    const duplicateNameKey = `${event.id}::${teamName.trim().toLowerCase()}`;

    if (existingTags.has(duplicateTagKey) || stagedTags.has(duplicateTagKey)) {
      errors.push({ row: rowNumber, field: "team_tag", message: `Tag tim "${teamTag}" sudah digunakan untuk event "${eventSlug}".` });
      rowValid = false;
    }

    if (existingNames.has(duplicateNameKey) || stagedNames.has(duplicateNameKey)) {
      errors.push({ row: rowNumber, field: "team_name", message: `Nama tim "${teamName}" sudah digunakan untuk event "${eventSlug}".` });
      rowValid = false;
    }

    const nextTeamCount =
      (existingTeamCounts.get(event.id) ?? 0) + (stagedTeamCounts.get(event.id) ?? 0) + 1;

    // participantCap is a file-level safety check: abort the entire import
    if (nextTeamCount > event.participantCap) {
      return fail(
        `Baris ${rowNumber}: event "${eventSlug}" akan melebihi batas peserta sebanyak ${event.participantCap} tim.`,
      );
    }

    if (rowValid) {
      stagedTags.add(duplicateTagKey);
      stagedNames.add(duplicateNameKey);
      stagedTeamCounts.set(event.id, (stagedTeamCounts.get(event.id) ?? 0) + 1);
      rows.push({
        eventId: event.id,
        teamName,
        teamTag,
        captainName,
        captainContact,
        captainEmail,
      });
    }
  }

  if (errors.length > 0) {
    const message = errors.map((e) => `Baris ${e.row} (${e.field}): ${e.message}`).join("\n");
    return { ok: false, message };
  }

  return { ok: true, rows };
}
