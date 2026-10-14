import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  getManageableEventDraft: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn((path: string) => ({ redirect: path })),
  setRequestLocale: vi.fn(),
  getRosterChangeSettings: vi.fn(),
  getTranslations: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/events/repository", () => ({
  getManageableEventDraft: mocks.getManageableEventDraft,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next-intl/server", () => ({ setRequestLocale: mocks.setRequestLocale, getTranslations: mocks.getTranslations }));
vi.mock("@/lib/platform/roster-change-settings", () => ({ getRosterChangeSettings: mocks.getRosterChangeSettings }));
vi.mock("@/components/v3/organizer/RosterChangeSettingsPanel", () => ({
  RosterChangeSettingsPanel: (props: { eventId: string; result?: string; error?: string }) => <div data-roster-panel={props.eventId} data-result={props.result} data-error={props.error} />,
  RosterChangeSettingsError: () => <div data-roster-error="true" />,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: mocks.redirectToActiveLocale }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));

import SettingsPage from "./page";
import { EventSettingsWorkspace } from "@/components/v3/organizer/EventSettingsWorkspace";

describe("SettingsPage", () => {
  beforeEach(() => {
    mocks.getRosterChangeSettings.mockReset();
    mocks.getRosterChangeSettings.mockRejectedValue(new Error("not configured in this test"));
    mocks.getTranslations.mockReset();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
  });

  it("rejects unsupported locales and missing events", async () => {
    await expect(SettingsPage({ params: Promise.resolve({ locale: "fr", eventId: "event-1" }) })).rejects.toThrow("NOT_FOUND");
    mocks.requireAnyRole.mockResolvedValue({ id: "owner", role: "organizer", mustChangePassword: false, name: "Organizer" });
    mocks.getManageableEventDraft.mockResolvedValue(null);
    await expect(SettingsPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("links to the existing editor, publication context, organizer contact, and safe preferences without wizard fields", async () => {
    mocks.requireAnyRole.mockResolvedValue({ id: "owner", role: "organizer", mustChangePassword: false, name: "Organizer" });
    mocks.getManageableEventDraft.mockResolvedValue({ id: "event-1", organizerUserId: "owner", slug: "miracle-open", name: "Miracle Open", status: "Draft", organizerName: "Miracle", organizer: { organizerProfile: { contactChannel: "WhatsApp", contactValue: "+6281" } } });
    const result = await SettingsPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) });
    const element = result as React.ReactElement<{ locale: "id" | "en"; event: { id: string; name: string; status: string; organizerName: string; organizer: { organizerProfile: { contactChannel: string; contactValue: string } } }; contact: { href: string | null } }>;
    expect(element.props.locale).toBe("id");
    expect(element.props.event.id).toBe("event-1");
    expect(element.props.contact.href).toBe("/id/organizer/profile");
    const html = renderToStaticMarkup(<EventSettingsWorkspace contact={{ href: "/id/organizer/profile" }} locale="id" event={element.props.event} />);
    expect(html).toContain("/id/organizer/events/event-1/edit");
    expect(html).toContain("publication");
    expect(html).toContain("contact");
    expect(html).toContain("preferences");
    expect(html).not.toContain("participantCap");
    expect(html).not.toContain("registrationOpensAt");
  });

  it("routes platform-owned contact editing to the localized platform profile", async () => {
    mocks.requireAnyRole.mockResolvedValue({ id: "admin", role: "platform_admin", mustChangePassword: false, name: "Admin" });
    mocks.getManageableEventDraft.mockResolvedValue({ id: "event-1", organizerUserId: null, name: "Platform Cup", status: "Published", organizerName: "Miracle", organizer: null });
    const result = await SettingsPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) });
    expect((result as React.ReactElement<{ contact: { href: string | null } }>).props.contact.href).toBe("/en/admin/platform-profile");
  });

  it("does not route an administrator to their own profile for another organizer's event", async () => {
    mocks.requireAnyRole.mockResolvedValue({ id: "admin", role: "admin", mustChangePassword: false, name: "Admin" });
    mocks.getManageableEventDraft.mockResolvedValue({ id: "event-1", organizerUserId: "organizer-1", name: "Organizer Cup", status: "Published", organizerName: "Other", organizer: null });
    const result = await SettingsPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) });
    expect((result as React.ReactElement<{ contact: { href: string | null } }>).props.contact.href).toBeNull();
  });

  describe("roster change panel", () => {
    const eventRow = { id: "event-1", organizerUserId: "owner", slug: "miracle-open", name: "Miracle Open", status: "Published", organizerName: "Miracle", organizer: null };
    const asOwner = () => {
      mocks.requireAnyRole.mockResolvedValue({ id: "owner", role: "organizer", mustChangePassword: false, name: "Organizer" });
      mocks.getManageableEventDraft.mockResolvedValue(eventRow);
    };
    type Page = React.ReactElement<{ children?: React.ReactElement<{ eventId: string; result?: string; error?: string }> | null }>;

    it("puts the panel inside the settings page for this event, loaded for the signed-in user", async () => {
      asOwner();
      mocks.getRosterChangeSettings.mockResolvedValue({ limit: 2 });
      const page = (await SettingsPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) })) as Page;
      expect(page.props.children?.props.eventId).toBe("event-1");
      expect(mocks.getRosterChangeSettings).toHaveBeenCalledWith(expect.objectContaining({ id: "owner" }), "event-1");
    });

    it("passes the result and error codes from the address bar to the panel", async () => {
      asOwner();
      mocks.getRosterChangeSettings.mockResolvedValue({ limit: 2 });
      const page = (await SettingsPage({
        params: Promise.resolve({ locale: "id", eventId: "event-1" }),
        searchParams: Promise.resolve({ rcResult: "approved", rcError: "window_closed" }),
      })) as Page;
      expect(page.props.children?.props.result).toBe("approved");
      expect(page.props.children?.props.error).toBe("window_closed");
    });

    it("keeps the rest of the page and says so when the panel cannot load", async () => {
      asOwner();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      mocks.getRosterChangeSettings.mockRejectedValue(new Error("db down: postgres://user:secret@host"));
      const page = (await SettingsPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) })) as Page;
      expect(page.props.children).toBeTruthy();
      expect(renderToStaticMarkup(page.props.children as React.ReactElement)).toContain("data-roster-error");
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret");
      consoleError.mockRestore();
    });
  });
});
