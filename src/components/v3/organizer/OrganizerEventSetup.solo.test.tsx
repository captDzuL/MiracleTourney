import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const draftForm = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/components/v3/events/EventDraftForm", () => ({ EventDraftForm: draftForm }));
vi.mock("@/components/v3/events/OrganizerContactForm", () => ({ OrganizerContactForm: () => null }));
vi.mock("@/components/v3/events/PreviewControls", () => ({ PreviewControls: () => null }));
vi.mock("@/components/v3/events/PublishReadiness", () => ({ PublishReadiness: () => null }));
vi.mock("@/components/v3/events/PublishedRevisionControls", () => ({ DiscardRevisionButton: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/lib/events/event-revision", () => ({ getActiveEventEditRevisionIds: vi.fn().mockResolvedValue({}) }));

import { OrganizerEventSetup } from "./OrganizerEventSetup";

Object.assign(globalThis, { React });

const event = {
  id: "event-1", slug: "solo-cup", name: "Solo Cup", description: "d", status: "Draft", gameModeId: "mode-flashpeak-5v5",
  entryMode: "solo", formatConfig: null, participantCap: 8, prizePoolLabel: null, registrationOpensAt: null,
  registrationClosesAt: null, eventStartsAt: null, timezone: "Asia/Jakarta", venue: "Online", venueAddress: null,
  registrationFeeRequired: false, registrationFeeAmount: null, logoUrl: null, gameImageUrl: null, draftRevision: 2,
  organizerUserId: "organizer-1", organizer: null,
};
const user = { id: "organizer-1", role: "organizer", email: "o@x.id", name: "O" };
const readiness = { ready: true, incomplete: [], notices: [] };

async function formProps() {
  draftForm.mockClear();
  const element = await OrganizerEventSetup({ event: event as never, user: user as never, locale: "id", readiness });
  // the composition is a tree of elements; find the draft form element in it
  const stack: unknown[] = [element];
  while (stack.length) {
    const node = stack.pop() as { type?: unknown; props?: { children?: unknown } } | null;
    if (!node || typeof node !== "object") continue;
    if (node.type === draftForm) return (node as { props: Record<string, unknown> }).props;
    const children = node.props?.children;
    if (Array.isArray(children)) stack.push(...children);
    else if (children) stack.push(children);
  }
  throw new Error("EventDraftForm was not rendered");
}

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("OrganizerEventSetup registration mode", () => {
  it("hands the stored mode and game to the form", async () => {
    const props = await formProps();
    expect(props.gameModeId).toBe("mode-flashpeak-5v5");
    expect((props.initialDraft as { entryMode: string }).entryMode).toBe("solo");
  });

  it("offers solo only while solo tournaments are on", async () => {
    expect((await formProps()).soloModes).toBeUndefined();
    vi.stubEnv("FEATURE_FLAG_SOLO_TOURNAMENT_V1", "true");
    expect((await formProps()).soloModes).toEqual([{ id: "mode-flashpeak-5v5", teamSize: 5, requiredPosition: "Goalkeeper" }]);
  });
});
