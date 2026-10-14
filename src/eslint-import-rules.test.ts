import fs from "node:fs";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Refactor PR 0.8: the import rules in eslint.import-rules.mjs must keep working, and their baseline must only shrink.
// Each case lints a snippet as if it lived in a real source file, so the same config that CI uses decides the result.

const baselineModulePath = "../eslint.import-baseline.mjs";
const { importBaseline } = (await import(baselineModulePath)) as { importBaseline: Record<string, string[]> };

const eslint = new ESLint();

async function importRuleMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((message) => message.ruleId === "no-restricted-imports").map((message) => message.message);
}

// Real files that are not in the baseline, so they are held to every rule that applies to their folder.
const LIB_FILE = "src/lib/events/public-discovery-read.ts";
const COMPONENT_FILE = "src/components/TeamAvatar.tsx";
const APP_FILE = "src/app/sitemap.ts";

describe("import rules", () => {
  it.each([
    ["R1", LIB_FILE, 'import { getPublicEvents } from "@/test-support/bracket-page-store";'],
    ["R3", COMPONENT_FILE, 'import { getPublicEvents } from "@/lib/events/repository";'],
    ["R4", APP_FILE, 'import { prisma } from "@/lib/platform/db";'],
    ["R5", LIB_FILE, 'import { TeamAvatar } from "@/components/TeamAvatar";'],
    ["R6", "src/lib/actions/team-actions.ts", 'import { prisma } from "@/lib/platform/db";'],
  ])("%s flags a new violation", async (id, filePath, code) => {
    const messages = await importRuleMessages(code, filePath);

    expect(messages.some((message) => message.includes(`[${id}]`))).toBe(true);
  });

  it.each([
    ["a type-only import of the repository in a component", COMPONENT_FILE, 'import type { getPublicEvents } from "@/lib/events/repository";'],
    ["a repository using Prisma", "src/lib/teams/repository.ts", 'import { prisma } from "@/lib/platform/db";'],
    ["a new-style action module", LIB_FILE, 'import { updateOrganizerProfileAction } from "@/lib/actions/organizer-profile-actions";'],
    ["the repository in a page", APP_FILE, 'import { getAllPublicEvents } from "@/lib/events/repository";'],
    ["a test file importing the bracket test store", "src/lib/actions.test.ts", 'import "@/test-support/bracket-page-store";'],
  ])("allows %s", async (_name, filePath, code) => {
    expect(await importRuleMessages(code, filePath)).toEqual([]);
  });

  it("excuses a file only from the rule it is listed under", async () => {
    const excusedFromR4 = "src/app/api/organizer/events/[eventId]/bracket-appearance/route.ts";
    expect(importBaseline.R4).toContain(excusedFromR4);

    const prisma = await importRuleMessages('import { prisma } from "@/lib/platform/db";', excusedFromR4);
    const demoStore = await importRuleMessages('import { getPublicEvents } from "@/test-support/bracket-page-store";', excusedFromR4);

    expect(prisma).toEqual([]);
    expect(demoStore.some((message) => message.includes("[R1]"))).toBe(true);
  });
}, 60_000);

describe("import baseline", () => {
  it.each(Object.entries(importBaseline))("%s lists only existing files, sorted and without repeats", (_id, files) => {
    expect(files.filter((file) => !fs.existsSync(file))).toEqual([]);
    expect(files).toEqual([...new Set(files)].sort());
  });
});
