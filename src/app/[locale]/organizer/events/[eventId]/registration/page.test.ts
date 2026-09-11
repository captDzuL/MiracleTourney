import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const { adminPage, setRequestLocale } = vi.hoisted(() => ({
  adminPage: vi.fn(),
  setRequestLocale: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ setRequestLocale }));
vi.mock("../../../../../admin/admin-workspace", () => ({ default: adminPage }));

import OrganizerRegistrationPage from "./page";

describe("organizer registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminPage.mockImplementation(async ({ searchParams, workspaceScope }) => {
      const query = await searchParams;
      return React.createElement("main", { "data-event-id": query.activeEventId, "data-phase": query.phase, "data-workspace-scope": workspaceScope }, "Registration workspace");
    });
  });

  it("opens the production registration workspace with explicit organizer access", async () => {
    const page = await OrganizerRegistrationPage({
      params: Promise.resolve({ locale: "id", eventId: "event-owned" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(setRequestLocale).toHaveBeenCalledWith("id");
    expect(markup).toContain('data-event-id="event-owned"');
    expect(markup).toContain('data-phase="registration"');
    expect(markup).toContain('data-workspace-scope="organizer_registration"');
  });
});