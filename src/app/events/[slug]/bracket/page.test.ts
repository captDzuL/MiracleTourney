import fs from "node:fs";
import path from "node:path";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, test } from "vitest";

import BracketPage from "./page";

Object.assign(globalThis, { React });

async function renderBracket(slug: string) {
  const page = await BracketPage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(page);
}

describe("public bracket page", () => {
  test("reads public-visible bracket data instead of the raw full projection", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("getPublicVisibleBracketPreview");
    expect(source).not.toContain("getBracketPreview(event.id)");
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
