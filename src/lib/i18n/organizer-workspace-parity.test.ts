import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import id from "../../../messages/id.json";

function keyTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keyTree);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, keyTree(child)]));
  }
  return typeof value;
}

describe("organizerMaster locale contract", () => {
  it("keeps the Indonesian and English namespace key trees identical", () => {
    expect(id.organizerMaster).toBeDefined();
    expect(en.organizerMaster).toBeDefined();
    expect(keyTree(id.organizerMaster)).toEqual(keyTree(en.organizerMaster));
  });

  it("contains no replacement characters or placeholder copy", () => {
    const serialized = JSON.stringify({ id: id.organizerMaster, en: en.organizerMaster });
    expect(serialized).not.toContain("�");
    expect(serialized).not.toMatch(/TODO|TBD|placeholder|lorem ipsum/i);
  });

  it("standardizes the required Indonesian workspace labels", () => {
    const serialized = JSON.stringify(id.organizerMaster);
    expect(serialized).toContain("Kontrol Pertandingan");
    expect(serialized).toContain("Penyelesaian");
    expect(serialized).toContain("Studio Sertifikat Premium");
  });
});
