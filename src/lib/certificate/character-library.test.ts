import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CHARACTER_LIBRARY, CHARACTER_LIBRARY_DIR, CHARACTER_ROLES, findCharacter, findCharacterBySourceUrl } from "./character-library";
import { CERTIFICATE_ASSET_LIMITS } from "./service";

const publicDir = path.join(process.cwd(), "public");
const FORMAT_BY_MIME = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" } as const;

describe("character library", () => {
  it("has the nine Flash Peak characters with unique ids and names", () => {
    expect(CHARACTER_LIBRARY).toHaveLength(9);
    expect(new Set(CHARACTER_LIBRARY.map((character) => character.id)).size).toBe(9);
    expect(new Set(CHARACTER_LIBRARY.map((character) => character.name)).size).toBe(9);
    expect(CHARACTER_LIBRARY.map((character) => character.name).sort()).toEqual(["Andrew", "Ford", "Hayato", "Homer", "Kelly", "Maxim", "Orion", "Rafael", "Shirou"]);
  });

  it("groups characters by the roles of the legacy roster", () => {
    const names = (role: (typeof CHARACTER_ROLES)[number]) => CHARACTER_LIBRARY.filter((character) => character.role === role).map((character) => character.name).sort();
    expect(names("defender")).toEqual(["Andrew", "Ford"]);
    expect(names("midfielder")).toEqual(["Hayato", "Homer", "Kelly"]);
    expect(names("striker")).toEqual(["Orion", "Rafael", "Shirou"]);
    expect(names("goalkeeper")).toEqual(["Maxim"]);
  });

  it("keeps every file and thumbnail under the public flashpeak folder", () => {
    for (const character of CHARACTER_LIBRARY) {
      expect(character.file.startsWith(`${CHARACTER_LIBRARY_DIR}/`), character.id).toBe(true);
      expect(character.thumb.startsWith(`${CHARACTER_LIBRARY_DIR}/thumbs/`), character.id).toBe(true);
      expect(character.id).toMatch(/^[a-z]+$/);
      expect(character.file).not.toContain("..");
    }
  });

  describe.each(CHARACTER_LIBRARY)("$id", (character) => {
    const file = path.join(publicDir, character.file);

    it("has its image and thumbnail on disk", () => {
      expect(existsSync(file)).toBe(true);
      expect(existsSync(path.join(publicDir, character.thumb))).toBe(true);
    });

    it("is a real image in the declared format that fits the certificate asset limits", async () => {
      const bytes = readFileSync(file);
      expect(statSync(file).size).toBeLessThanOrEqual(CERTIFICATE_ASSET_LIMITS.maxBytes);
      const meta = await sharp(bytes).metadata();
      expect(meta.format).toBe(FORMAT_BY_MIME[character.mimeType]);
      expect(meta.width).toBeGreaterThanOrEqual(CERTIFICATE_ASSET_LIMITS.minDimension);
      expect(meta.height).toBeGreaterThanOrEqual(CERTIFICATE_ASSET_LIMITS.minDimension);
      expect(meta.width).toBeLessThanOrEqual(CERTIFICATE_ASSET_LIMITS.maxDimension);
      expect(meta.height).toBeLessThanOrEqual(CERTIFICATE_ASSET_LIMITS.maxDimension);
      await expect(sharp(bytes, { failOn: "error" }).stats()).resolves.toBeDefined();
    });

    it("has a decodable thumbnail", async () => {
      const meta = await sharp(path.join(publicDir, character.thumb)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBeLessThanOrEqual(480);
    });
  });
});

describe("findCharacter", () => {
  it("finds a character by id", () => {
    expect(findCharacter("shirou")).toMatchObject({ name: "Shirou", role: "striker", mimeType: "image/webp" });
    expect(findCharacter("maxim")).toMatchObject({ name: "Maxim", role: "goalkeeper", mimeType: "image/jpeg" });
  });

  it.each(["", "SHIROU", "../shirou", "shirou.webp", "constructor", "__proto__", "toString", "unknown"])("does not resolve %j", (id) => {
    expect(findCharacter(id)).toBeNull();
  });
});

describe("findCharacterBySourceUrl", () => {
  it("matches only the exact library file path", () => {
    expect(findCharacterBySourceUrl("/character-art/flashpeak/kelly.webp")?.name).toBe("Kelly");
    expect(findCharacterBySourceUrl("/character-art/flashpeak/kelly.webp?x=1")).toBeNull();
    expect(findCharacterBySourceUrl("/character-art/roster/midfielder/Kelly.png")).toBeNull();
    expect(findCharacterBySourceUrl(null)).toBeNull();
  });
});
