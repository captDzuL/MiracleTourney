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

function validateSafeTextField(rowNumber: number, field: string, value: string): ImportFailure | null {
  if (hasSpreadsheetFormulaPayload(value)) {
    return fail(`Row ${rowNumber}: ${field} cannot start with a spreadsheet formula character.`);
  }

  return null;
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

export function parseAndValidateTeamImport(csvText: string, snapshot: ImportSnapshot): ParseTeamImportResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return fail("CSV must include a header row and at least one team row.");
  }
  if (lines.length - 1 > MAX_IMPORT_ROWS) {
    return fail(`CSV has too many rows. Maximum import size is ${MAX_IMPORT_ROWS} team rows.`);
  }

  const headers = parseCsvLine(lines[0].replace(/^\uFEFF/, ""));

  const hasOptionalEmail = headers.length === REQUIRED_HEADERS.length + 1 &&
    headers[REQUIRED_HEADERS.length] === OPTIONAL_HEADERS[0];

  if (
    (headers.length !== REQUIRED_HEADERS.length && !hasOptionalEmail) ||
    REQUIRED_HEADERS.some((h, i) => headers[i] !== h)
  ) {
    return fail(
      `CSV header must start with: ${REQUIRED_HEADERS.join(", ")} (optional extra column: captain_email)`,
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
  const rows: ImportRow[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const rowNumber = index + 1;
    const values = parseCsvLine(lines[index]);

    const expectedColumns = hasOptionalEmail ? REQUIRED_HEADERS.length + 1 : REQUIRED_HEADERS.length;
    if (values.length !== expectedColumns) {
      return fail(`Row ${rowNumber}: expected ${expectedColumns} columns, received ${values.length}.`);
    }

    const [eventSlug, teamName, teamTagRaw, captainName, captainContact, captainEmailRaw] = values;
    const captainEmail = captainEmailRaw?.trim() || undefined;

    if (!eventSlug) return fail(`Row ${rowNumber}: event_slug is required.`);
    if (!teamName) return fail(`Row ${rowNumber}: team_name is required.`);
    if (!teamTagRaw) return fail(`Row ${rowNumber}: team_tag is required.`);
    if (!captainName) return fail(`Row ${rowNumber}: captain_name is required.`);
    if (!captainContact) return fail(`Row ${rowNumber}: captain_contact is required.`);

    for (const [field, value] of [
      ["team_name", teamName],
      ["team_tag", teamTagRaw],
      ["captain_name", captainName],
      ["captain_contact", captainContact],
      ["captain_email", captainEmail ?? ""],
    ] as const) {
      const unsafeField = validateSafeTextField(rowNumber, field, value);
      if (unsafeField) return unsafeField;
    }

    const event = eventsBySlug.get(eventSlug);
    if (!event) {
      return fail(`Row ${rowNumber}: unknown event_slug "${eventSlug}".`);
    }

    if (event.bracketLocked) {
      return fail(`Event "${eventSlug}" already has recorded match results, so additional teams cannot be imported.`);
    }

    const teamTag = teamTagRaw.toUpperCase();
    const duplicateKey = `${event.id}::${teamTag}`;
    const duplicateNameKey = `${event.id}::${teamName.trim().toLowerCase()}`;

    if (existingTags.has(duplicateKey) || stagedTags.has(duplicateKey)) {
      return fail(`Row ${rowNumber}: team_tag "${teamTag}" already exists for event_slug "${eventSlug}".`);
    }

    if (existingNames.has(duplicateNameKey) || stagedNames.has(duplicateNameKey)) {
      return fail(`Row ${rowNumber}: team_name "${teamName}" already exists for event_slug "${eventSlug}".`);
    }

    const nextTeamCount =
      (existingTeamCounts.get(event.id) ?? 0) + (stagedTeamCounts.get(event.id) ?? 0) + 1;

    if (nextTeamCount > event.participantCap) {
      return fail(
        `Row ${rowNumber}: event_slug "${eventSlug}" would exceed its participant cap of ${event.participantCap} teams.`,
      );
    }

    stagedTags.add(duplicateKey);
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

  return { ok: true, rows };
}
