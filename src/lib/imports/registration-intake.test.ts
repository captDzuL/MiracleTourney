import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  buildRegistrationPreview,
  parseRegistrationSource,
  suggestRegistrationMapping,
} from "./registration-intake";

async function workbookBuffer(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Form Responses 1");
  for (const row of rows) worksheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("registration intake source parsing", () => {
  it("parses CSV exports with BOM, quoted cells, and multiline values", async () => {
    const csv = [
      "\uFEFFNama Tim,Nama Kapten,Email Kapten,Player 1 Nickname",
      '"Red Clover","Alya","alya@example.com","RC\nAlya"',
    ].join("\n");

    const result = await parseRegistrationSource({
      kind: "csv",
      fileName: "redclover.csv",
      buffer: Buffer.from(csv, "utf8"),
    });

    expect(result.worksheets).toHaveLength(1);
    expect(result.worksheets[0]).toMatchObject({
      name: "redclover.csv",
      rows: [
        [
          { value: "Nama Tim", formula: false },
          { value: "Nama Kapten", formula: false },
          { value: "Email Kapten", formula: false },
          { value: "Player 1 Nickname", formula: false },
        ],
        [
          { value: "Red Clover", formula: false },
          { value: "Alya", formula: false },
          { value: "alya@example.com", formula: false },
          { value: "RC\nAlya", formula: false },
        ],
      ],
    });
  });

  it("parses a selected worksheet from XLSX and marks formula cells", async () => {
    const buffer = await workbookBuffer([
      ["Nama Tim", "Nama Kapten", "Email Kapten"],
      ["Red Clover", "Alya", { formula: "HYPERLINK(\"https://example.test\")", result: "alya@example.com" }],
    ]);

    const result = await parseRegistrationSource({
      kind: "xlsx",
      fileName: "redclover.xlsx",
      buffer,
      worksheetName: "Form Responses 1",
    });

    expect(result.worksheets).toHaveLength(1);
    expect(result.worksheets[0].name).toBe("Form Responses 1");
    expect(result.worksheets[0].rows[1][2]).toEqual({
      value: "alya@example.com",
      formula: true,
    });
  });

  it("rejects over-large files, row overflow, and column overflow", async () => {
    await expect(parseRegistrationSource({
      kind: "csv",
      fileName: "large.csv",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    })).rejects.toThrow("maksimal 5 MiB");

    const tooManyRows = ["Nama Tim", ...Array.from({ length: 513 }, (_, i) => `Team ${i}`)].join("\n");
    await expect(parseRegistrationSource({
      kind: "csv",
      fileName: "rows.csv",
      buffer: Buffer.from(tooManyRows),
    })).rejects.toThrow("maksimal 512 baris");

    const tooManyColumns = Array.from({ length: 129 }, (_, i) => `Kolom ${i}`).join(",");
    await expect(parseRegistrationSource({
      kind: "csv",
      fileName: "columns.csv",
      buffer: Buffer.from(tooManyColumns),
    })).rejects.toThrow("maksimal 128 kolom");
  });
});

describe("registration intake mapping and preview", () => {
  it("suggests Indonesian and English form headers including Player 1-N groups", () => {
    const mapping = suggestRegistrationMapping([
      "Nama Team",
      "Tag",
      "Captain Name",
      "No WhatsApp Kapten",
      "Email",
      "Nickname Player 1",
      "Nama Pemain 1",
      "Role Player 1",
      "Player 2 IGN",
    ], { maxRosterSize: 2 });

    expect(mapping.columns).toMatchObject({
      teamName: 0,
      teamTag: 1,
      captainName: 2,
      captainContact: 3,
      captainEmail: 4,
    });
    expect(mapping.players).toEqual([
      { nickname: 5, displayName: 6, position: 7 },
      { nickname: 8 },
    ]);
    expect(mapping.unmappedColumns).toEqual([]);
  });

  it("previews new, changed, same, and conflict rows without deleting missing teams", () => {
    const preview = buildRegistrationPreview({
      event: {
        id: "event-1",
        name: "RedClover Cup",
        slug: "redclover-cup",
        participantCap: 8,
        bracketLocked: false,
        maxRosterSize: 2,
      },
      existingTeams: [
        {
          id: "team-a",
          name: "Alpha",
          tag: "ALP",
          captainName: "Alya",
          captainContact: "081",
          players: [{ nickname: "Alya", displayName: "Alya", position: "Guard" }],
        },
        {
          id: "team-b",
          name: "Beta",
          tag: "BET",
          captainName: "Bima",
          captainContact: "082",
          players: [{ nickname: "Bima", displayName: "Bima", position: "Unassigned" }],
        },
      ],
      existingUsers: [
        { id: "captain-1", email: "alya@example.com", role: "captain" },
        { id: "organizer-1", email: "staff@example.com", role: "organizer" },
      ],
      rows: [
        {
          sourceRow: 2,
          cells: ["Gamma", "", "Gina", "", "gina@example.com", "Gina"],
        },
        {
          sourceRow: 3,
          cells: ["Alpha", "ALP", "Alya Prime", "081", "alya@example.com", "Alya"],
        },
        {
          sourceRow: 4,
          cells: ["Beta", "BET", "Bima", "082", "", "Bima"],
        },
        {
          sourceRow: 5,
          cells: ["Staff Team", "STF", "Staff", "083", "staff@example.com", "Staff"],
        },
      ],
      mapping: {
        columns: { teamName: 0, teamTag: 1, captainName: 2, captainContact: 3, captainEmail: 4 },
        players: [{ nickname: 5 }],
      },
    });

    expect(preview.summary).toMatchObject({ new: 1, changed: 1, same: 1, error: 1 });
    expect(preview.items.map((item) => item.status)).toEqual(["new", "changed", "same", "error"]);
    expect(preview.items[0]).toMatchObject({
      selected: true,
      normalized: {
        teamName: "Gamma",
        teamTag: "GAM",
        captainName: "Gina",
        captainEmail: "gina@example.com",
        captainContact: "",
        players: [{ nickname: "Gina", displayName: "Gina", position: "Unassigned" }],
      },
    });
    expect(preview.items[1].selected).toBe(false);
    expect(preview.items[1].diff).toEqual(
      expect.arrayContaining([
        { field: "captainName", before: "Alya", after: "Alya Prime" },
      ]),
    );
    expect(preview.items[3]).toMatchObject({
      selected: false,
      errors: ["Email kapten sudah dipakai akun non-captain."],
    });
  });

  it("blocks mapped formula cells and roster overflow during preview", () => {
    const preview = buildRegistrationPreview({
      event: {
        id: "event-1",
        name: "RedClover Cup",
        slug: "redclover-cup",
        participantCap: 8,
        bracketLocked: false,
        maxRosterSize: 1,
      },
      existingTeams: [],
      existingUsers: [],
      rows: [
        {
          sourceRow: 2,
          cells: ["Formula FC", "FFC", "Alya", "081", "alya@example.com", "Alya", "Bima"],
          formulaColumns: [0],
        },
        {
          sourceRow: 3,
          cells: ["Overflow FC", "OFC", "Bima", "082", "", "Bima", "Caca"],
        },
      ],
      mapping: {
        columns: { teamName: 0, teamTag: 1, captainName: 2, captainContact: 3, captainEmail: 4 },
        players: [{ nickname: 5 }, { nickname: 6 }],
      },
    });

    expect(preview.items[0]).toMatchObject({
      status: "error",
      errors: expect.arrayContaining(["Kolom yang dipetakan tidak boleh berisi formula spreadsheet."]),
    });
    expect(preview.items[1]).toMatchObject({
      status: "error",
      errors: ["Roster melebihi batas 1 pemain untuk mode event ini."],
    });
  });
});
