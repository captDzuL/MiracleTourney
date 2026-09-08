import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Task 7b teams boundaries", () => {
  it.each([
    "src/app/captain/page.tsx",
    "src/app/captain/stats/page.tsx",
    "src/app/events/[slug]/participants/participants-page.tsx",
  ])("routes active team and player reads through the teams barrel in %s", (relativePath) => {
    const content = source(relativePath);
    expect(content).toContain('from "@/modules/teams"');
  });

  it("keeps actor-less compatibility off the primary teams barrel", () => {
    const barrel = source("src/modules/teams/index.ts");
    expect(barrel).not.toMatch(/compatibility/);
    expect(barrel).not.toMatch(/repository/);
  });

  it("reduces captain roster legacy surfaces to teams-module facades", () => {
    const actions = source("src/lib/actions.ts");
    const repository = source("src/lib/platform/repository.ts");

    expect(actions).toMatch(/captainAddPlayerActionFromModule/);
    expect(actions).toMatch(/return captainAddPlayerActionFromModule\(formData\)/);
    expect(repository).toMatch(/getCaptainTeamsFromTeamsModule/);
    expect(repository).toMatch(/addPlayerWithoutActor/);
    expect(repository).not.toMatch(/async function assertRosterEditable/);
  });
});