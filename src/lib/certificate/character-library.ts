/** Folder under public/ that holds the optimized Flash Peak character art the certificate studio can import. */
export const CHARACTER_LIBRARY_DIR = "character-art/flashpeak";

export const CHARACTER_ROLES = ["defender", "midfielder", "striker", "goalkeeper"] as const;
export type CharacterRole = (typeof CHARACTER_ROLES)[number];
export type CharacterMimeType = "image/png" | "image/jpeg" | "image/webp";

export type LibraryCharacter = {
  readonly id: string;
  readonly name: string;
  readonly role: CharacterRole;
  /** Path of the full-size image relative to public/, without a leading slash. */
  readonly file: string;
  /** Path of the 240px thumbnail relative to public/, served over HTTP and never imported. */
  readonly thumb: string;
  readonly mimeType: CharacterMimeType;
};

const character = (id: string, name: string, role: CharacterRole, extension: "webp" | "jpg", mimeType: CharacterMimeType): LibraryCharacter => Object.freeze({
  id, name, role, mimeType,
  file: `${CHARACTER_LIBRARY_DIR}/${id}.${extension}`,
  thumb: `${CHARACTER_LIBRARY_DIR}/thumbs/${id}.webp`,
});

/** Closed allowlist: a character id from the client is only ever looked up here, never turned into a path. */
export const CHARACTER_LIBRARY: readonly LibraryCharacter[] = Object.freeze([
  character("andrew", "Andrew", "defender", "webp", "image/webp"),
  character("ford", "Ford", "defender", "webp", "image/webp"),
  character("hayato", "Hayato", "midfielder", "webp", "image/webp"),
  character("homer", "Homer", "midfielder", "webp", "image/webp"),
  character("kelly", "Kelly", "midfielder", "webp", "image/webp"),
  character("orion", "Orion", "striker", "webp", "image/webp"),
  character("rafael", "Rafael", "striker", "webp", "image/webp"),
  character("shirou", "Shirou", "striker", "webp", "image/webp"),
  character("maxim", "Maxim", "goalkeeper", "jpg", "image/jpeg"),
]);

export function findCharacter(id: string): LibraryCharacter | null {
  return CHARACTER_LIBRARY.find((candidate) => candidate.id === id) ?? null;
}

/** The asset row of an imported character stores the library path as its source; this maps it back to the character. */
export function findCharacterBySourceUrl(sourceUrl: string | null): LibraryCharacter | null {
  if (!sourceUrl) return null;
  return CHARACTER_LIBRARY.find((candidate) => `/${candidate.file}` === sourceUrl) ?? null;
}
