// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

import { PublicParticipantsDirectory, type PublicParticipantTeam } from "./PublicParticipantsDirectory";

const player = { id: "p1", displayName: "UID-123", nickname: "Player11", position: "Forward" };
const team = (n: number, players = [player]): PublicParticipantTeam => ({ id: `team-${n}`, name: `Team ${n}`, tag: `T${n}`, captain: `Captain ${n}`, players });

describe("PublicParticipantsDirectory", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(teams: PublicParticipantTeam[], locale: "id" | "en" = "id") {
    act(() => root.render(<PublicParticipantsDirectory teams={teams} locale={locale} />));
  }

  function click(button: HTMLButtonElement) {
    act(() => button.click());
  }

  function searchInput(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  }

  it("opens a labeled roster and restores trigger focus after Escape", () => {
    render([team(1)]);
    const trigger = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Lihat roster"))!;
    click(trigger);
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("UID-123");
    expect(dialog.textContent).toContain("Player11");
    expect(dialog.textContent).toContain("Forward");
    expect(dialog.textContent).toMatch(/UID[\s\S]*UID-123[\s\S]*IGN[\s\S]*Player11[\s\S]*Posisi[\s\S]*Forward/);
    expect(document.activeElement).toBe(dialog.querySelector("button"));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("traps Tab and Shift+Tab inside an open roster", () => {
    render([team(1)]);
    click([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Lihat roster"))!);
    const close = container.querySelector<HTMLButtonElement>('[role="dialog"] button')!;
    expect(document.activeElement).toBe(close);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(close);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(close);
  });

  it("keeps the published empty-roster message", () => {
    render([team(1, [])], "en");
    click([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("View roster"))!);
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Roster has not been published.");
  });

  it("searches team and player fields and filters roster status", () => {
    render([team(1), team(2, []), team(3, [{ ...player, id: "p3", nickname: "UniqueIGN", displayName: "UID-789" }])]);
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    searchInput(search, "UniqueIGN");
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("article")?.textContent).toContain("Team 3");
    searchInput(search, "");
    const select = container.querySelector<HTMLSelectElement>('select[name="roster-status"]')!;
    act(() => { select.value = "pending"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("article")?.textContent).toContain("Team 2");
  });

  it("paginates 12 cards at a time and resets to the first page when filtering", () => {
    render(Array.from({ length: 13 }, (_, index) => team(index + 1)));
    expect(container.querySelectorAll("article")).toHaveLength(12);
    click([...container.querySelectorAll<HTMLButtonElement>("nav button")].find((button) => button.textContent === "Berikutnya")!);
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("article")?.textContent).toContain("Team 13");
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    searchInput(search, "Team 1");
    expect(container.querySelectorAll("article")).toHaveLength(5);
    expect(container.querySelector("nav")?.textContent).toContain("1 / 1");
  });
});
