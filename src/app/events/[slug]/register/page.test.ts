import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import { isValidElement } from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicEventBySlug: vi.fn(),
  getSessionUser: vi.fn(),
  getGameModeConfig: vi.fn(),
  getCaptainTeams: vi.fn(),
  getCaptainRegistrationRequests: vi.fn(),
  getPlayersForTeam: vi.fn(),
  getTeamCountsForEvents: vi.fn(),
  getCaptainPaymentSettings: vi.fn(),
  renderSoloRegistrationPage: vi.fn(),
}));

vi.mock("@/lib/platform/repository", () => ({
  getCaptainRegistrationRequests: mocks.getCaptainRegistrationRequests,
  getCaptainTeams: mocks.getCaptainTeams,
  getPlayersForTeam: mocks.getPlayersForTeam,
  getPublicEventBySlug: mocks.getPublicEventBySlug,
  getTeamCountsForEvents: mocks.getTeamCountsForEvents,
}));
vi.mock("@/lib/platform/config", () => ({ getGameModeConfig: mocks.getGameModeConfig }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/registration/captain-repository", () => ({ getCaptainPaymentSettings: mocks.getCaptainPaymentSettings }));
vi.mock("@/components/registration/CaptainRegistrationWizard", () => ({
  CaptainRegistrationWizard: () => null,
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children?: unknown }) => children }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("./solo-registration-page", () => ({ renderSoloRegistrationPage: mocks.renderSoloRegistrationPage }));

import { renderEventRegistrationPage } from "./event-registration-page";

function findPaymentSettingsElement(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findPaymentSettingsElement(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(value)) return null;
  const props = value.props as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(props, "paymentSettings")) return props;
  return findPaymentSettingsElement(props.children);
}

describe("native event registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    mocks.getPublicEventBySlug.mockResolvedValue({
      id: "event-1",
      slug: "event-one",
      name: "Event One",
      gameModeId: "mode-1",
      registrationWindow: "Open",
      participantCap: 16,
      format: "Single Elimination",
      registrationFeeLabel: "Gratis",
      registrationFeeRequired: false,
    });
    mocks.getSessionUser.mockResolvedValue({ id: "captain-1", role: "captain", name: "Captain" });
    mocks.getGameModeConfig.mockReturnValue({ teamSize: 5, positions: [] });
    mocks.getTeamCountsForEvents.mockResolvedValue(new Map([["event-1", 2]]));
    mocks.getCaptainTeams.mockResolvedValue([]);
    mocks.getCaptainRegistrationRequests.mockResolvedValue([]);
    mocks.getPlayersForTeam.mockResolvedValue([]);
    mocks.getCaptainPaymentSettings.mockResolvedValue({ id: "event-payment-event-1", eventId: "event-1", source: "event" });
  });

  it("passes the authoritative event id to the scoped captain payment reader", async () => {
    const settings = { id: "event-settings-1", eventId: "event-1", source: "event", status: "published", version: 2 };
    mocks.getCaptainPaymentSettings.mockResolvedValue(settings);

    const page = await renderEventRegistrationPage("event-one");

    expect(mocks.getCaptainPaymentSettings).toHaveBeenCalledWith("event-1");
    expect(findPaymentSettingsElement(page)).toMatchObject({ paymentSettings: settings });
  });

  it.each([
    ["published event settings", { id: "event-settings-1", eventId: "event-1", source: "event", status: "published" }],
    ["draft/missing event settings", { id: "event-payment-event-1", eventId: "event-1", source: "event" }],
  ])("passes through %s without replacing the reader result", async (_label, settings) => {
    mocks.getCaptainPaymentSettings.mockResolvedValue(settings);

    const page = await renderEventRegistrationPage("event-one");

    expect(findPaymentSettingsElement(page)).toMatchObject({ paymentSettings: settings });
  });

  it("does not log or derive payment settings from roster or personal data", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await renderEventRegistrationPage("event-one");

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("renders the shared captain registration page", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");
    expect(source).toContain("renderEventRegistrationPage");
  });

  describe("a solo event", () => {
    const soloEvent = { id: "event-1", slug: "event-one", name: "Event One", gameModeId: "mode-1", entryMode: "solo", participantCap: 16, format: "Single Elimination", registrationWindow: "Open" };

    beforeEach(() => {
      mocks.getPublicEventBySlug.mockResolvedValue(soloEvent);
      mocks.renderSoloRegistrationPage.mockResolvedValue("SOLO-PAGE");
    });

    it("is handed to the solo page with the visitor, language and last message, and reads nothing about teams", async () => {
      const user = { id: "player-1", role: "player", name: "Bima" };
      mocks.getSessionUser.mockResolvedValue(user);
      const page = await renderEventRegistrationPage("event-one", "en", Promise.resolve({ success: "queued" }));

      expect(page).toBe("SOLO-PAGE");
      expect(mocks.renderSoloRegistrationPage).toHaveBeenCalledWith({ event: soloEvent, user, locale: "en", search: { success: "queued" } });
      expect(mocks.getTeamCountsForEvents).not.toHaveBeenCalled();
      expect(mocks.getCaptainTeams).not.toHaveBeenCalled();
      expect(mocks.getCaptainPaymentSettings).not.toHaveBeenCalled();
    });

    it("is shown to a visitor who is not signed in", async () => {
      mocks.getSessionUser.mockResolvedValue(null);
      await renderEventRegistrationPage("event-one", "id");
      expect(mocks.renderSoloRegistrationPage).toHaveBeenCalledWith(expect.objectContaining({ user: null, locale: "id" }));
    });
  });

  it("never opens the solo page for a team event", async () => {
    await renderEventRegistrationPage("event-one");
    expect(mocks.renderSoloRegistrationPage).not.toHaveBeenCalled();
  });

  it("has a localized wrapper", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../../[locale]/events/[slug]/register/page.tsx"), "utf8");
    expect(source).toContain("setRequestLocale");
    expect(source).toContain("renderEventRegistrationPage");
  });

  it("pres the approved registration experience to real data", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./event-registration-page.tsx"), "utf8");
    expect(source).toContain("CaptainRegistrationWizard");
    expect(source).toContain("getPublicEventBySlug");
    expect(source).toContain("getSessionUser");
    expect(source).toContain("getGameModeConfig");
  });
});
