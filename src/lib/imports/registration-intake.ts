import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";

import { validateTeamData } from "@/lib/validation/team-data";

export type RegistrationSourceKind = "xlsx" | "csv" | "google-sheet";

export type RegistrationCell = {
  value: string;
  formula: boolean;
};

export type RegistrationWorksheet = {
  name: string;
  rows: RegistrationCell[][];
};

export type RegistrationMapping = {
  columns: {
    teamName?: number;
    teamTag?: number;
    captainName?: number;
    captainContact?: number;
    captainEmail?: number;
  };
  players: Array<{
    nickname?: number;
    displayName?: number;
    position?: number;
  }>;
  unmappedColumns?: number[];
  ambiguousColumns?: number[];
};

export type RegistrationParsedRow = {
  sourceRow: number;
  cells: string[];
  formulaColumns?: number[];
};

export type RegistrationPreviewItemStatus = "new" | "changed" | "same" | "error";

export type RegistrationNormalizedTeam = {
  teamName: string;
  teamTag: string;
  captainName: string;
  captainContact: string;
  captainEmail?: string;
  players: Array<{
    nickname: string;
    displayName: string;
    position: string;
  }>;
};

export type RegistrationPreviewItem = {
  sourceRow: number;
  status: RegistrationPreviewItemStatus;
  selected: boolean;
  normalized?: RegistrationNormalizedTeam;
  existingTeamId?: string;
  diff?: Array<{ field: string; before: string; after: string }>;
  errors?: string[];
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 512;
const MAX_COLUMNS = 128;

type MappingOptions = {
  maxRosterSize: number;
};

function cleanText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).replace(/^\uFEFF/, "").trim();
}

function assertSourceBounds(rows: RegistrationCell[][]) {
  const dataRows = Math.max(0, rows.length - 1);
  if (dataRows > MAX_DATA_ROWS) {
    throw new Error(`File registrasi maksimal ${MAX_DATA_ROWS} baris data.`);
  }
  if (rows.some((row) => row.length > MAX_COLUMNS)) {
    throw new Error(`File registrasi maksimal ${MAX_COLUMNS} kolom.`);
  }
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function readExcelCell(cell: ExcelJS.Cell): RegistrationCell {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    return { value: cleanText(result), formula: true };
  }
  if (value && typeof value === "object" && "text" in value) {
    return { value: cleanText((value as ExcelJS.CellHyperlinkValue).text), formula: false };
  }
  if (value && typeof value === "object" && "richText" in value) {
    return {
      value: (value as ExcelJS.CellRichTextValue).richText.map((part) => part.text).join("").trim(),
      formula: false,
    };
  }
  return { value: cleanText(value), formula: false };
}

function findLastNonEmptyCell(row: RegistrationCell[]) {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    if (row[index]?.value !== "" || row[index]?.formula) return index + 1;
  }
  return 0;
}

function trimRows(rows: RegistrationCell[][]) {
  return rows
    .map((row) => row.slice(0, findLastNonEmptyCell(row)))
    .filter((row) => row.some((cell) => cell.value !== "" || cell.formula));
}

export async function parseRegistrationSource(input: {
  kind: Exclude<RegistrationSourceKind, "google-sheet">;
  fileName: string;
  buffer: Buffer;
  worksheetName?: string;
}): Promise<{ sourceKind: RegistrationSourceKind; worksheets: RegistrationWorksheet[] }> {
  if (input.buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error("File registrasi maksimal 5 MiB.");
  }

  if (input.kind === "csv") {
    const records = parseCsv(input.buffer, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as unknown[][];
    const rows = trimRows(
      records.map((row) =>
        row.map((value) => ({
          value: cleanText(value),
          formula: false,
        })),
      ),
    );
    assertSourceBounds(rows);
    return { sourceKind: "csv", worksheets: [{ name: input.fileName, rows }] };
  }

  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = input.buffer.buffer.slice(
    input.buffer.byteOffset,
    input.buffer.byteOffset + input.buffer.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);
  const selectedWorksheets = input.worksheetName
    ? workbook.worksheets.filter((worksheet) => worksheet.name === input.worksheetName)
    : workbook.worksheets;

  const worksheets = selectedWorksheets.map((worksheet) => {
    const rows: RegistrationCell[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: RegistrationCell[] = [];
      for (let columnIndex = 1; columnIndex <= row.cellCount; columnIndex += 1) {
        cells.push(readExcelCell(row.getCell(columnIndex)));
      }
      rows.push(cells);
    });
    return { name: worksheet.name, rows: trimRows(rows) };
  });

  for (const worksheet of worksheets) assertSourceBounds(worksheet.rows);
  return { sourceKind: "xlsx", worksheets };
}

const directSynonyms: Record<keyof RegistrationMapping["columns"], string[]> = {
  teamName: ["nama team", "nama tim", "team name", "nama squad", "nama club"],
  teamTag: ["tag", "team tag", "tag team", "kode tim", "singkatan tim"],
  captainName: ["nama kapten", "captain name", "kapten", "pic name", "nama pic"],
  captainContact: ["no whatsapp kapten", "whatsapp kapten", "kontak kapten", "captain contact", "phone", "nomor hp", "wa"],
  captainEmail: ["email", "email kapten", "captain email", "alamat email"],
};

function assignDirectColumn(header: string): keyof RegistrationMapping["columns"] | null {
  for (const [key, synonyms] of Object.entries(directSynonyms)) {
    if (synonyms.includes(header)) return key as keyof RegistrationMapping["columns"];
  }
  return null;
}

function playerColumn(header: string): { index: number; field: "nickname" | "displayName" | "position" } | null {
  const match = header.match(/(?:player|pemain)\s*(\d+)\s*(.*)|(.+?)\s*(?:player|pemain)\s*(\d+)/);
  if (!match) return null;

  const index = Number(match[1] ?? match[4]);
  const descriptor = normalizeHeader(match[2] ?? match[3] ?? "");
  if (!Number.isInteger(index) || index < 1) return null;

  if (["nickname", "nick", "ign", "id game"].includes(descriptor)) return { index, field: "nickname" };
  if (["nama", "nama pemain", "display name", "full name"].includes(descriptor)) return { index, field: "displayName" };
  if (["role", "posisi", "position"].includes(descriptor)) return { index, field: "position" };
  if (descriptor === "") return { index, field: "nickname" };

  return null;
}

export function suggestRegistrationMapping(headers: string[], options: MappingOptions): RegistrationMapping {
  const columns: RegistrationMapping["columns"] = {};
  const players: RegistrationMapping["players"] = Array.from({ length: options.maxRosterSize }, () => ({}));
  const unmappedColumns: number[] = [];

  headers.forEach((header, columnIndex) => {
    const normalized = normalizeHeader(header);
    const directKey = assignDirectColumn(normalized);
    if (directKey) {
      columns[directKey] ??= columnIndex;
      return;
    }

    const player = playerColumn(normalized);
    if (player && player.index <= options.maxRosterSize) {
      players[player.index - 1][player.field] ??= columnIndex;
      return;
    }

    unmappedColumns.push(columnIndex);
  });

  return {
    columns,
    players: players.filter((player) => Object.keys(player).length > 0),
    unmappedColumns,
    ambiguousColumns: [],
  };
}

function valueAt(row: RegistrationParsedRow, column?: number) {
  return column == null ? "" : cleanText(row.cells[column]);
}

function hasMappedFormula(row: RegistrationParsedRow, mapping: RegistrationMapping) {
  const formulaColumns = new Set(row.formulaColumns ?? []);
  const mappedColumns = [
    ...Object.values(mapping.columns),
    ...mapping.players.flatMap((player) => Object.values(player)),
  ].filter((column): column is number => typeof column === "number");
  return mappedColumns.some((column) => formulaColumns.has(column));
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function makeTag(teamName: string, existingTags: Set<string>) {
  const words = teamName.match(/[a-zA-Z0-9]+/g) ?? [];
  const base = (words.length > 1 ? words.map((word) => word[0]).join("") : teamName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3))
    .slice(0, 5)
    .toUpperCase()
    .padEnd(2, "X");
  let tag = base;
  let suffix = 2;
  while (existingTags.has(tag)) {
    tag = `${base.slice(0, Math.max(2, 5 - String(suffix).length))}${suffix}`;
    suffix += 1;
  }
  existingTags.add(tag);
  return tag;
}

function normalizeRow(
  row: RegistrationParsedRow,
  mapping: RegistrationMapping,
  usedTags: Set<string>,
): RegistrationNormalizedTeam {
  const teamName = valueAt(row, mapping.columns.teamName);
  const explicitTag = valueAt(row, mapping.columns.teamTag).toUpperCase();
  const teamTag = explicitTag || makeTag(teamName, usedTags);
  if (explicitTag) usedTags.add(explicitTag);

  const players = mapping.players
    .map((player) => {
      const nickname = valueAt(row, player.nickname);
      if (!nickname) return null;
      const displayName = valueAt(row, player.displayName) || nickname;
      const position = valueAt(row, player.position) || "Unassigned";
      return { nickname, displayName, position };
    })
    .filter((player): player is RegistrationNormalizedTeam["players"][number] => player != null);

  return {
    teamName,
    teamTag,
    captainName: valueAt(row, mapping.columns.captainName),
    captainContact: valueAt(row, mapping.columns.captainContact),
    captainEmail: valueAt(row, mapping.columns.captainEmail).toLowerCase() || undefined,
    players,
  };
}

function samePlayers(
  left: RegistrationNormalizedTeam["players"],
  right: RegistrationNormalizedTeam["players"],
) {
  if (left.length !== right.length) return false;
  return left.every((player, index) => {
    const other = right[index];
    return other
      && player.nickname === other.nickname
      && player.displayName === other.displayName
      && player.position === other.position;
  });
}

export function buildRegistrationPreview(input: {
  event: {
    id: string;
    name: string;
    slug: string;
    participantCap: number;
    bracketLocked: boolean;
    maxRosterSize: number;
  };
  existingTeams: Array<{
    id: string;
    name: string;
    tag: string;
    captainName?: string | null;
    captainContact?: string | null;
    players: RegistrationNormalizedTeam["players"];
  }>;
  existingUsers: Array<{ id: string; email: string; role: string }>;
  rows: RegistrationParsedRow[];
  mapping: RegistrationMapping;
}): { items: RegistrationPreviewItem[]; summary: Record<RegistrationPreviewItemStatus, number> } {
  const existingTags = new Set(input.existingTeams.map((team) => team.tag.toUpperCase()));
  const teamsByTag = new Map(input.existingTeams.map((team) => [team.tag.toUpperCase(), team]));
  const teamsByName = new Map(input.existingTeams.map((team) => [normalizeName(team.name), team]));
  const usersByEmail = new Map(input.existingUsers.map((user) => [user.email.toLowerCase(), user]));
  const seenTags = new Set<string>();
  const seenNames = new Set<string>();

  const items = input.rows.map<RegistrationPreviewItem>((row) => {
    const errors: string[] = [];
    if (input.event.bracketLocked) errors.push("Event sudah memiliki hasil pertandingan.");
    if (hasMappedFormula(row, input.mapping)) {
      errors.push("Kolom yang dipetakan tidak boleh berisi formula spreadsheet.");
    }

    const normalized = normalizeRow(row, input.mapping, existingTags);
    if (!normalized.teamName) errors.push("Nama tim wajib diisi.");
    if (!normalized.captainName) errors.push("Nama kapten wajib diisi.");
    if (!normalized.captainContact && !normalized.captainEmail) {
      errors.push("Minimal kontak atau email kapten wajib diisi.");
    }
    if (normalized.players.length === 0) errors.push("Minimal satu nickname pemain wajib diisi.");
    if (normalized.players.length > input.event.maxRosterSize) {
      errors.push(`Roster melebihi batas ${input.event.maxRosterSize} pemain untuk mode event ini.`);
    }

    for (const error of validateTeamData({
      teamName: normalized.teamName,
      teamTag: normalized.teamTag,
      captainName: normalized.captainName,
      captainContact: normalized.captainContact,
    })) {
      errors.push(error.message);
    }

    const user = normalized.captainEmail ? usersByEmail.get(normalized.captainEmail) : undefined;
    if (user && user.role !== "captain") {
      errors.push("Email kapten sudah dipakai akun non-captain.");
    }

    const normalizedName = normalizeName(normalized.teamName);
    if (seenTags.has(normalized.teamTag)) errors.push(`Tag tim "${normalized.teamTag}" duplikat di file.`);
    if (seenNames.has(normalizedName)) errors.push(`Nama tim "${normalized.teamName}" duplikat di file.`);
    seenTags.add(normalized.teamTag);
    seenNames.add(normalizedName);

    const existing = teamsByTag.get(normalized.teamTag) ?? teamsByName.get(normalizedName);

    if (errors.length > 0) {
      return { sourceRow: row.sourceRow, status: "error", selected: false, normalized, errors };
    }

    if (!existing) {
      return { sourceRow: row.sourceRow, status: "new", selected: true, normalized };
    }

    const diff: RegistrationPreviewItem["diff"] = [];
    if (existing.name !== normalized.teamName) diff.push({ field: "teamName", before: existing.name, after: normalized.teamName });
    if (existing.tag !== normalized.teamTag) diff.push({ field: "teamTag", before: existing.tag, after: normalized.teamTag });
    if ((existing.captainName ?? "") !== normalized.captainName) {
      diff.push({ field: "captainName", before: existing.captainName ?? "", after: normalized.captainName });
    }
    if ((existing.captainContact ?? "") !== normalized.captainContact) {
      diff.push({ field: "captainContact", before: existing.captainContact ?? "", after: normalized.captainContact });
    }
    if (!samePlayers(existing.players, normalized.players)) {
      diff.push({ field: "players", before: JSON.stringify(existing.players), after: JSON.stringify(normalized.players) });
    }

    if (diff.length === 0) {
      return { sourceRow: row.sourceRow, status: "same", selected: false, normalized, existingTeamId: existing.id, diff: [] };
    }

    return { sourceRow: row.sourceRow, status: "changed", selected: false, normalized, existingTeamId: existing.id, diff };
  });

  const summary = { new: 0, changed: 0, same: 0, error: 0 };
  for (const item of items) summary[item.status] += 1;

  return { items, summary };
}
