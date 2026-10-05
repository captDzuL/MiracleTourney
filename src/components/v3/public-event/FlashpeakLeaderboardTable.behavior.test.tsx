// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { FlashpeakLeaderboardTable } from "./FlashpeakLeaderboardTable";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const rows = [
  { playerId: "a", playerName: "Ari", nickname: "Ari", teamId: "a", teamName: "Alpha", position: "Forward", game: 4, score: 8.15, goal: 3, assist: 2, passing: 28, defense: 8 },
];

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("FlashpeakLeaderboardTable filtering", () => {
  it("shows the filter-empty state after a search removes every player", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<FlashpeakLeaderboardTable locale="en" entries={rows} />);
    });

    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "unknown");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("No players match the filters.");
    expect(container.textContent).not.toContain("No completed player statistics yet.");
  });
});
