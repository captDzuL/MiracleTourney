const LETTERS_AND_DIGITS = /[\p{L}\p{N}]+/gu;
const FALLBACK_MONOGRAM = "M";
const NAME_SIZE_STEPS: readonly (readonly [maxCharacters: number, fontSize: number])[] = [[14, 58], [22, 48], [34, 38], [48, 32], [60, 26]];
const MIN_NAME_FONT_SIZE = 22;

const characterCount = (value: string) => Array.from(value).length;

/** Up to `max` upper-case letters taken from the first words of a name, for the round event/team monogram. */
export function monogramInitials(name: string, max = 2): string {
  const words = name.normalize("NFC").match(LETTERS_AND_DIGITS) ?? [];
  const firstCharacters = words.length >= 2
    ? words.slice(0, max).map((word) => Array.from(word)[0])
    : Array.from(words[0] ?? "").slice(0, max);
  const initials = Array.from(firstCharacters.join("").toUpperCase()).slice(0, max).join("");
  return initials || FALLBACK_MONOGRAM;
}

/** Font size (px) of the recipient name so a long name still fits the recipient zone in two lines. */
export function recipientNameFontSize(name: string): number {
  const length = characterCount(name);
  return NAME_SIZE_STEPS.find(([maxCharacters]) => length <= maxCharacters)?.[1] ?? MIN_NAME_FONT_SIZE;
}
