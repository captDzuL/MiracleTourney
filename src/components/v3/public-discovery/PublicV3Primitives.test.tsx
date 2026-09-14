// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventPosterStage } from "./EventPosterStage";
import { PublicV3Frame } from "./PublicV3Frame";
import { PublicV3Action, PublicV3Count, PublicV3EmptyState, PublicV3FactStrip, PublicV3Filter, PublicV3StatusBadge, PublicV3Tabs } from "./PublicV3Primitives";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("final public V3 primitives", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const render = (node: React.ReactNode) => act(() => root.render(node));
  const failImage = () => act(() => container.querySelector("img")?.dispatchEvent(new Event("error")));
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("prioritizes a real event poster and preserves its supplied alternative text", () => {
    render(<EventPosterStage eventName="Community Cup" gameSlug="flashpeak" posterUrl="/event-posters/cup.png" posterAlt="Community Cup official poster" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/event-posters/cup.png");
    expect(container.querySelector("img")?.alt).toBe("Community Cup official poster");
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("uses the event identity when a poster alternative is blank", () => {
    render(<EventPosterStage eventName="Community Cup" posterUrl="https://images.example.com/cup.png" posterAlt="  " />);
    expect(container.querySelector("img")?.alt).toBe("Community Cup");
  });

  it.each([null, "  ", "javascript:alert(1)", "//images.example.com/cup.png"])("uses local Flashpeak characters for invalid poster %s", (posterUrl) => {
    render(<EventPosterStage eventName="Community Cup" gameSlug="flashpeak" posterUrl={posterUrl} />);
    expect(Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"))).toEqual([
      "/character-art/roster/midfielder/Kelly.png", "/character-art/roster/striker/Rafael.png",
    ]);
    expect(Array.from(container.querySelectorAll("img")).every((img) => img.alt === "")).toBe(true);
    expect(container.textContent).toContain("Community Cup");
  });

  it("recovers a failed poster through local art then branded text without invented prize or season", () => {
    render(<EventPosterStage eventName="Community Cup" gameSlug="flashpeak" posterUrl="/missing.png" />);
    failImage();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/character-art/roster/midfielder/Kelly.png");
    failImage();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("MIRACLE");
    expect(container.textContent).toContain("Community Cup");
    expect(container.textContent).not.toMatch(/Rp|Season|32|Golden Ticket/);
  });

  it("does not use Flashpeak art for another game and retries a changed poster", () => {
    render(<EventPosterStage eventName="Other Cup" gameSlug="other" />);
    expect(container.querySelector("img")).toBeNull();
    render(<EventPosterStage eventName="Other Cup" gameSlug="other" posterUrl="/failed.png" />);
    failImage();
    expect(container.querySelector("img")).toBeNull();
    render(<EventPosterStage eventName="Other Cup" gameSlug="other" posterUrl="/new.png" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/new.png");
  });

  it("keeps resolved CTA targets keyboard focusable and represents an unavailable target without a false link", () => {
    render(<><PublicV3Action href="/id/events/cup/bracket" variant="primary">Lihat bracket</PublicV3Action><PublicV3Action href={null}>Belum terbit</PublicV3Action></>);
    const link = container.querySelector("a");
    link?.focus();
    expect(document.activeElement).toBe(link);
    expect(link?.getAttribute("href")).toBe("/id/events/cup/bracket");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector('[aria-disabled="true"]')?.textContent).toBe("Belum terbit");
  });

  it("preserves known zero facts and counts while using human fallbacks for missing facts", () => {
    render(<><PublicV3FactStrip facts={[{ label: "Teams", value: 0 }, { label: "Prize", value: null, fallback: "Belum diumumkan" }, { label: "Date", value: "  ", fallback: "TBD" }]} /><PublicV3Count value={0} label="Teams" /><PublicV3Count value={null} label="Wins" fallback="Belum terbit" /></>);
    expect(Array.from(container.querySelectorAll("dd")).map((item) => item.textContent)).toEqual(["0", "Belum diumumkan", "TBD"]);
    expect(container.textContent).toContain("0Teams");
    expect(container.textContent).toContain("Belum terbitWins");
  });

  it("keeps semantic statuses readable without inventing labels from keys", () => {
    render(<PublicV3StatusBadge status="ongoing" label="Sedang berlangsung" />);
    expect(container.textContent).toBe("Sedang berlangsung");
    expect(container.querySelector('[data-status="ongoing"]')).not.toBeNull();
  });

  it("uses current-page navigation and native GET filters with accessible labels", () => {
    render(<><PublicV3Tabs label="Event sections" items={[{ href: "/en/events/cup", label: "Overview", active: true }, { href: "/en/events/cup/bracket", label: "Bracket" }]} /><PublicV3Filter id="game-filter" name="game" label="Game" defaultValue="all" options={[{ value: "all", label: "All games" }, { value: "flashpeak", label: "Flashpeak" }]} /></>);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("Overview");
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Event sections");
    expect(container.querySelector("label")?.htmlFor).toBe(container.querySelector("select")?.id);
    expect(container.querySelector("select")?.name).toBe("game");
  });

  it("renders honest empty-state copy without creating a default action", () => {
    render(<PublicV3EmptyState title="Bracket unpublished" description="The organizer has not published a drawing." />);
    expect(container.querySelector("h2")?.textContent).toBe("Bracket unpublished");
    expect(container.querySelector("a,button")).toBeNull();
  });

  it("provides scoped landmarks and a skip target without hardcoded route or event data", () => {
    render(<PublicV3Frame brandHref="/en" homeLabel="Miracle home" skipLabel="Skip to content" navigationLabel="Main navigation" navigation={[{ href: "/en/events", label: "Events", active: true }]}><h1>Events</h1></PublicV3Frame>);
    expect(container.firstElementChild?.classList.contains("miracle-public-v3")).toBe(true);
    expect(container.querySelector("header nav a")?.getAttribute("href")).toBe("/en/events");
    expect(container.querySelector("main")?.tabIndex).toBe(-1);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`#${container.querySelector("main")?.id}`);
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
});
