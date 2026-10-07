import { readFileSync } from "node:fs";

export function normalizeSourceText(source: string) {
  return source.replace(/\r\n?/g, "\n");
}

export function readSourceText(path: string) {
  return normalizeSourceText(readFileSync(path, "utf8"));
}
