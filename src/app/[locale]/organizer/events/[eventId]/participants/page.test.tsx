import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
Object.assign(globalThis, { React });
const m = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), context: vi.fn(), queue: vi.fn() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); } }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: (url: string) => { throw Error(url); } }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: m.auth }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent: m.access, getRegistrationImportEventContext: m.context }));
vi.mock("@/lib/registration/organizer-workspace-read", () => ({ getEventRegistrationQueue: m.queue }));
vi.mock("@/components/v3/organizer/registration/RegistrationWorkspace", () => ({ RegistrationWorkspace: (props: object) => <pre>{JSON.stringify(props)}</pre> }));
import Page from "./page";
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ id: "owner", role: "organizer" }); m.access.mockResolvedValue(undefined); m.context.mockResolvedValue({ id: "cup", participantCap: 16, teams: [{ id: "team-a", name: "Alpha", players: [{ nickname: "Raka", displayName: "123", position: "Captain" }] }, { id: "other", name: "Hidden" }] }); m.queue.mockResolvedValue({ items: [{ id: "team-a", teamId: "team-a" }], total: 1, page: 1, pageSize: 25, totalPages: 1 }); });
it("renders only accepted event roster data, preserves filters and omits unrelated teams and payment proofs", async () => {
 const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "id", eventId: "cup" }), searchParams: Promise.resolve({ q: "Raka", source: "import_xlsx", page: "2" }) }));
 expect(html).toContain("Alpha"); expect(html).toContain("123"); expect(html).not.toContain("Hidden"); expect(html).not.toContain("proofImageUrl");
 expect(m.queue).toHaveBeenCalledWith(expect.objectContaining({ eventId: "cup", status: "accepted", source: "import_xlsx", query: "Raka", page: 2 }));
});
it("enforces session and ownership before roster reads", async () => {
 m.auth.mockResolvedValue(null); await expect(Page({ params: Promise.resolve({ locale: "en", eventId: "cup" }) })).rejects.toThrow("/login"); expect(m.context).not.toHaveBeenCalled();
 m.auth.mockResolvedValue({ id: "stranger", role: "organizer" }); m.access.mockRejectedValue(Error("Not authorized")); await expect(Page({ params: Promise.resolve({ locale: "en", eventId: "cup" }) })).rejects.toThrow(); expect(m.queue).not.toHaveBeenCalled();
});
