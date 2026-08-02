import fs from "node:fs";
import path from "node:path";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, test } from "vitest";

import { createEvent, importTeams, resetDemoStore, setEventStatus } from "@/lib/platform/demo-store";
import BracketPage from "./page";

Object.assign(globalThis, { React });

async function renderBracket(slug: string) {
  const page = await BracketPage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(page);
}

describe("public bracket page", () => {
  beforeEach(resetDemoStore);
  afterEach(resetDemoStore);

  test("reads public-visible bracket data instead of the raw full projection", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("getPublicVisibleBracketPreview");
    expect(source).not.toContain("getBracketPreview(event.id)");
  });

  it("hides unresolved downstream rounds for a single-elimination bracket with byes", async () => {
    const event = createEvent({
      name: "Bye path visibility test",
      slug: "bye-path-visibility-test",
      gameModeId: "mode-kuroko-3v3",
      format: "Single Elimination",
      participantCap: 8,
    });
    setEventStatus(event.id, "Published");
    importTeams(
      Array.from({ length: 6 }, (_, index) => ({
        eventId: event.id,
        teamName: `Team ${index + 1}`,
        teamTag: `T${index + 1}`,
        captainName: `Captain ${index + 1}`,
        captainContact: `captain-${index + 1}@example.test`,
      })),
    );

    const markup = await renderBracket(event.slug);

    expect(markup).toContain("Auto-advance");
    expect(markup).not.toContain("Semifinal");
  });

  it("does not show a completed score on a projected matchup with different teams", async () => {
    const markup = await renderBracket("kuroko-summer-cup");

    expect(markup).not.toContain("21 - 16");
    expect(markup).not.toContain("18 - 20");
  });

  it("shows completed league fixture scores from recorded matches", async () => {
    const markup = await renderBracket("flashpeak-open-league");

    expect(markup).toContain("4 - 2");
    expect(markup).toContain("1 - 1");
  });
});
