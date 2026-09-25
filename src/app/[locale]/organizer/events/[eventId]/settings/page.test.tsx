import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  getManageableEventDraft: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirectToActiveLocale: vi.fn((path: string) => ({ redirect: path })),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.requireAnyRole }));
vi.mock("@/lib/platform/repository", () => ({ getManageableEventDraft: mocks.getManageableEventDraft }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next-intl/server", () => ({ setRequestLocale: mocks.setRequestLocale, getTranslations: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: mocks.redirectToActiveLocale }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));

import SettingsPage from "./page";
import { EventSettingsWorkspace } from "@/components/v3/organizer/EventSettingsWorkspace";

describe("SettingsPage", () => {
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
});