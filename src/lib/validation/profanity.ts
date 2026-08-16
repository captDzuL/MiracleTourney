import { readFileSync } from "fs";
import { join } from "path";

const rawList = readFileSync(
  join(process.cwd(), "src/lib/validation/profanity-blocklist.txt"),
  "utf-8"
);
const BLOCKLIST = new Set(
  rawList.split("\n").map(w => w.trim().toLowerCase()).filter(Boolean)
);

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/(.)\1+/g, "$1")      // collapse repeated chars
    .replace(/[^a-z0-9\s]/g, ""); // strip special chars
}

export function containsProfanity(text: string): boolean {
  const normalized = normalize(text);
  return (
    BLOCKLIST.has(normalized) ||
    normalized.split(/\s+/).some(w => BLOCKLIST.has(w))
  );
}
