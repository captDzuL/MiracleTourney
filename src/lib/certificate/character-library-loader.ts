import { readFile } from "node:fs/promises";
import path from "node:path";
import { CHARACTER_LIBRARY_DIR, type CharacterMimeType, type LibraryCharacter } from "./character-library";

export type LoadedLibraryCharacter =
  | { readonly ok: true; readonly bytes: Buffer; readonly mimeType: CharacterMimeType }
  | { readonly ok: false; readonly code: "character_file_missing" };

const MISSING = { ok: false, code: "character_file_missing" } as const;

/**
 * Reads a library character from public/. The file path comes from the static library, never from the client, and
 * it must still resolve inside the library folder so a bad entry can never read anything else.
 */
export async function loadLibraryCharacter(
  character: LibraryCharacter,
  read: (absolutePath: string) => Promise<Buffer> = readFile,
): Promise<LoadedLibraryCharacter> {
  const root = path.resolve(process.cwd(), "public", CHARACTER_LIBRARY_DIR);
  const absolutePath = path.resolve(process.cwd(), "public", character.file);
  if (path.isAbsolute(character.file) || !absolutePath.startsWith(root + path.sep)) return MISSING;
  try {
    const bytes = await read(absolutePath);
    return bytes.length > 0 ? { ok: true, bytes, mimeType: character.mimeType } : MISSING;
  } catch {
    return MISSING;
  }
}
