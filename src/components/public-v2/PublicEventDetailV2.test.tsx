import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Event, Game, GameMode } from "@/lib/platform/types";

Object.assign(globalThis, { React });
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/ShareButton", () => ({ ShareButton: () => <button type="button">Share event</button> }));
vi.mock("@/components/public-v2/ConfettiField", () => ({ ConfettiField: () => null }));
vi.mock("@/components/public-v2/EventVisual", () => ({ EventVisual: () => <div>Event visual</div> }));

import { PublicEventDetailV2 } from "./PublicEventDetailV2";

const event = {
  id: "event-1", slug: "miracle-open", name: "Miracle Open", description: "Draft event",
  gameId: "game-1", gameModeId: "mode-1", format: "Single Elimination", status: "Draft",
  participantCap: 16, registrationWindow: "Registration opens soon", startsAt: "2026-09-10", venue: "Online",
  registrationUrl: "https://registration.example.test/miracle-open",
} as Event;
const game = { id: "game-1", name: "Flashpeak" } as Game;
const mode = { id: "mode-1", name: "5v5", teamSize: 5, maxRosterSize: 8, positions: [] } as unknown as GameMode;
const labels = {
  liveNow: "Live now", organizer: "Organizer", issue: "Event", teamCount: "0/16 registered teams",
  register: "Register Event", quickLinks: "Quick links", participants: "Participants", bracket: "Bracket",
  standings: "Standings", leaderboards: "Leaderboards", prizePool: "Prize Pool", entryFee: "Entry Fee",
};

describe("PublicEventDetailV2", () => {
  it("suppresses share, registration, and public navigation in read-only preview mode", () => {
    const markup = renderToStaticMarkup(
      <PublicEventDetailV2
        event={event}
        game={game}
        mode={mode}
        teams={[]}
        bracket={[]}
        labels={labels}
        readOnly
      />,
    );

    expect(markup).not.toContain("Share event");
    expect(markup).not.toContain("Register Event");
    expect(markup).not.toContain("Quick links");
    expect(markup).not.toContain("/events/miracle-open/");
  });
});