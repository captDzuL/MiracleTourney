import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import { soloCopy } from "@/components/solo/registration-copy";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...out, [path]: value } : { ...out, ...flatten(value, path) };
  }, {});
}

/** Index of the brace that closes the one opened at `start`. */
function closingBrace(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}" && (depth -= 1) === 0) return index;
  }
  return text.length;
}

/** The names a message takes, including those inside plural and select branches. */
function argumentNames(message: string): string[] {
  const names = new Set<string>();
  for (let index = message.indexOf("{"); index !== -1; index = message.indexOf("{", index + 1)) {
    const end = closingBrace(message, index);
    const inside = message.slice(index + 1, end);
    const name = inside.split(/[,}]/)[0].trim();
    if (/^\w+$/.test(name)) names.add(name);
    const branches = /^\w+\s*,\s*(?:plural|select|selectordinal)\s*,(.*)$/s.exec(inside);
    if (branches) for (const branch of branches[1].matchAll(/\w+\s*\{/g)) {
      const open = index + 1 + inside.indexOf(branches[1]) + (branch.index ?? 0) + branch[0].length - 1;
      argumentNames(message.slice(open + 1, closingBrace(message, open))).forEach((inner) => names.add(inner));
    }
    index = end;
  }
  return [...names].sort();
}

const ids = flatten(id as Tree);
const ens = flatten(en as Tree);

/** Namespaces the solo tournament added. Indonesian wording here follows the Bahasa Lazim rules. */
const SOLO_KEYS = Object.keys(ids).filter((key) => /^(player|registrationWorkspace\.solo)\./.test(key)
  || /^organizerMaster\.editor\.(entryMode|soloQuota|soloFeeHint)/.test(key)
  || /^register\.(role|player|whatsapp|errorWhatsapp)/.test(key)
  || /^captain\.(soloRosterNote|rosterManagementOwnerDescription)$/.test(key));

/** Words the Indonesian text must not use. One thing, one word: Daftar, Slot, Antrean, Acak tim, Kunci tim, Kiper. */
const FORBIDDEN = [/\bregistrasi\b/i, /\bwaitlist\b/i, /\bdraw(ing)?\b/i, /\bgoalkeeper\b/i, /\boutfield\b/i, /\bsolo queue\b/i, /\bseed\b/i];

const withoutArguments = (text: string) => text.replace(/\{[^}]*\}/g, "");
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean);
const wordCount = (text: string) => text.trim().split(/\s+/).length;

describe("message files", () => {
  it("have the same keys in Indonesian and English", () => {
    expect(Object.keys(ens).sort()).toEqual(Object.keys(ids).sort());
  });

  it("take the same arguments in both languages, whatever the plural forms", () => {
    const mismatched = Object.keys(ids).filter((key) => JSON.stringify(argumentNames(ids[key])) !== JSON.stringify(argumentNames(ens[key])));
    expect(mismatched).toEqual([]);
  });

  it("reads arguments out of plain, plural and nested messages", () => {
    expect(argumentNames("Halo, {name}")).toEqual(["name"]);
    expect(argumentNames("{count, plural, one {# item} other {# items for {owner}}}")).toEqual(["count", "owner"]);
    expect(argumentNames("Tidak ada argumen.")).toEqual([]);
  });
});

describe("solo texts in Indonesian", () => {
  it("covers the namespaces it is supposed to check", () => {
    expect(SOLO_KEYS.length).toBeGreaterThan(150);
  });

  it.each(SOLO_KEYS)("%s uses the agreed words", (key) => {
    for (const word of FORBIDDEN) expect(withoutArguments(ids[key]), key).not.toMatch(word);
  });

  it.each(SOLO_KEYS)("%s is at most two sentences, and a question is at most 13 words", (key) => {
    expect(sentences(ids[key]).length, key).toBeLessThanOrEqual(2);
    if (ids[key].trim().endsWith("?")) expect(wordCount(ids[key]), key).toBeLessThanOrEqual(13);
  });

  it("keeps the same rules in the registration copy written in code", () => {
    const copy = soloCopy("id");
    const texts = Object.values(copy).map((value) => (typeof value === "function"
      ? (value as (...args: string[]) => string)("a", "b", "c")
      : value));
    for (const text of texts) {
      for (const word of FORBIDDEN) expect(text).not.toMatch(word);
      expect(sentences(text).length, text).toBeLessThanOrEqual(2);
    }
  });
});
