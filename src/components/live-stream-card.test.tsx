// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import { LiveStreamCard } from "@/components/ui";
import { getLiveStreamPresentation } from "@/lib/tournament/engine";
import idMessages from "../../messages/id.json";
import enMessages from "../../messages/en.json";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function renderCard(url: string, locale: "id" | "en" = "id") {
  const presentation = getLiveStreamPresentation(url);
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "id" ? idMessages : enMessages} timeZone="Asia/Jakarta">
      <LiveStreamCard label="Final turnamen" {...presentation} />
    </NextIntlClientProvider>,
  );
  return container;
}

describe("LiveStreamCard", () => {
  it("shows the account from the saved LIVE link and opens that destination without embedding it", () => {
    const url = "https://www.tiktok.com/@bangkajoc/live?source=event";
    const card = renderCard(url);
    expect(card.querySelector("h3")?.textContent).toBe("@bangkajoc");
    expect(card.textContent).toContain("Final turnamen");
    const link = card.querySelector("a")!;
    expect(link.textContent).toContain("Tonton di TikTok");
    expect(link.getAttribute("href")).toBe(url);
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(card.querySelector("iframe")).toBeNull();
    expect(card.textContent).not.toMatch(/sedang live|sedang siaran|live now/i);
  });

  it("uses English copy and derives another account without hardcoding the sample", () => {
    const card = renderCard("https://tiktok.com/@team.miracle_2/live/", "en");
    expect(card.querySelector("h3")?.textContent).toBe("@team.miracle_2");
    expect(card.querySelector("a")?.textContent).toContain("Watch on TikTok");
    expect(card.textContent).not.toContain("Tonton di TikTok");
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
  ])("preserves the YouTube player for %s", (url) => {
    const card = renderCard(url);
    expect(card.querySelector("iframe")?.getAttribute("src")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(card.querySelector("a")?.getAttribute("href")).toBe(url);
  });

  it.each([
    "https://www.tiktok.com/@bangkajoc/video/123",
    "https://www.tiktok.com/@bangkajoc",
    "https://vm.tiktok.com/abc123/",
    "https://tiktok.com.example.org/@bangkajoc/live",
    "https://example.org/?url=tiktok.com/@bangkajoc/live",
    "https://user:password@www.tiktok.com/@bangkajoc/live",
    "not-a-url",
  ])("keeps the generic fallback for a non-LIVE or untrusted link: %s", (url) => {
    const card = renderCard(url);
    expect(card.querySelector("h3")).toBeNull();
    expect(card.querySelector("iframe")).toBeNull();
    expect(card.querySelector("a")?.textContent).toContain("Watch source");
  });
});
