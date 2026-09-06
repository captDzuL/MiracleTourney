import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const { requireAnyRole, getGameModes, isFeatureEnabled, notFound, redirectToActiveLocale } = vi.hoisted(() => ({
  requireAnyRole: vi.fn(), getGameModes: vi.fn(), isFeatureEnabled: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn(() => { throw new Error("REDIRECT"); }),
}));

vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/lib/platform/repository", () => ({ getGameModes }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("next/navigation", () => ({ notFound }));

import NewEventPage from "./page";

describe("organizer new event page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", name: "Organizer" });
    getGameModes.mockReturnValue([{ id: "mode-1", name: "5v5" }]);
  });

  it("renders the minimal draft entry with all authoritative format presets", async () => {
    const markup = renderToStaticMarkup(await NewEventPage({ params: Promise.resolve({ locale: "en" }) }));
    expect(markup).toContain('name="name"');
    expect(markup).toContain('name="gameModeId"');
    expect(markup).toContain('value="single_elimination"');
    expect(markup).toContain('value="double_elimination"');
    expect(markup).toContain('value="round_robin"');
    expect(markup).toContain('value="group_playoffs"');
  });

  it("keeps advanced competition formats hidden while their rollback flag is off", async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === "organizer_workspace_v3");
    const markup = renderToStaticMarkup(await NewEventPage({ params: Promise.resolve({ locale: "en" }) }));
    expect(markup).toContain('value="single_elimination"');
    expect(markup).not.toContain('value="double_elimination"');
    expect(markup).not.toContain('value="round_robin"');
    expect(markup).not.toContain('value="group_playoffs"');
  });

  it("requires the feature flag and an event manager session", async () => {
    isFeatureEnabled.mockReturnValue(false);
    await expect(NewEventPage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow("NOT_FOUND");
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue(null);
    await expect(NewEventPage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow("REDIRECT");
  });
});