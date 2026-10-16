import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CHARACTER_LIBRARY, findCharacter, type LibraryCharacter } from "./character-library";
import { loadLibraryCharacter } from "./character-library-loader";

const shirou = findCharacter("shirou")!;
const crafted = (file: string): LibraryCharacter => ({ ...shirou, file });

describe("loadLibraryCharacter", () => {
  it.each(CHARACTER_LIBRARY.map((character) => [character.id, character] as const))("reads the real %s file from public/", async (_id, character) => {
    const loaded = await loadLibraryCharacter(character);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.bytes.length).toBeGreaterThan(1000);
      expect(loaded.mimeType).toBe(character.mimeType);
    }
  });

  it.each([
    "character-art/flashpeak/../../../.env",
    "character-art/flashpeak/../roster/striker/Shirou.png",
    "character-art/roster/striker/Shirou.png",
    "../package.json",
    "/etc/passwd",
    "C:\Windows\win.ini",
    "character-art/flashpeak2/shirou.webp",
    "character-art/flashpeak",
  ])("refuses %j without touching the file system", async (file) => {
    const readFile = vi.fn();
    await expect(loadLibraryCharacter(crafted(file), readFile)).resolves.toEqual({ ok: false, code: "character_file_missing" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("reports a missing file as character_file_missing", async () => {
    const readFile = vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    await expect(loadLibraryCharacter(shirou, readFile)).resolves.toEqual({ ok: false, code: "character_file_missing" });
    expect(readFile).toHaveBeenCalledWith(path.resolve(process.cwd(), "public", "character-art", "flashpeak", "shirou.webp"));
  });

  it("reports an empty file as character_file_missing", async () => {
    await expect(loadLibraryCharacter(shirou, async () => Buffer.alloc(0))).resolves.toEqual({ ok: false, code: "character_file_missing" });
  });
});
