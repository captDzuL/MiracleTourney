import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildRegistrationPreview,
  parseRegistrationSource,
  suggestRegistrationMapping,
} from "./registration-intake";

const templateDir = resolve(process.cwd(), "public/templates");

const event = {
  id: "event-1",
  name: "Template Cup",
  slug: "template-cup",
  participantCap: 32,
  bracketLocked: false,
  maxRosterSize: 5,
  minRosterSize: 5,
};

describe.each([
  ["csv", "registration-import-template.csv"],
  ["xlsx", "registration-import-template.xlsx"],
] as const)("downloadable registration template (%s)", (kind, fileName) => {
  it("maps automatically and previews every example row as new", async () => {
    const buffer = readFileSync(resolve(templateDir, fileName));
    const { worksheets } = await parseRegistrationSource({ kind, fileName, buffer });
    const [sheet] = worksheets;
    const headers = sheet.rows[0].map((cell) => cell.value);

    const mapping = suggestRegistrationMapping(headers, { maxRosterSize: event.maxRosterSize });
    expect(mapping.columns).toMatchObject({
      teamName: expect.any(Number),
      teamTag: expect.any(Number),
      captainName: expect.any(Number),
      captainContact: expect.any(Number),
      captainEmail: expect.any(Number),
      captainIgn: expect.any(Number),
      captainUid: expect.any(Number),
      captainIsPlayer: expect.any(Number),
    });
    expect(mapping.unmappedColumns).toEqual([]);
    expect(mapping.players).toHaveLength(event.maxRosterSize);

    const rows = sheet.rows.slice(1).map((row, index) => ({
      sourceRow: index + 2,
      cells: row.map((cell) => cell.value),
      formulaColumns: row.flatMap((cell, column) => (cell.formula ? [column] : [])),
    }));
    expect(rows).toHaveLength(2);

    const { items, summary } = buildRegistrationPreview({
      event,
      existingTeams: [],
      existingUsers: [],
      rows,
      mapping,
    });
    expect(items.flatMap((item) => item.errors ?? [])).toEqual([]);
    expect(summary).toEqual({ new: 2, changed: 0, same: 0, error: 0 });
  });
});
