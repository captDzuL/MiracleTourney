import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });

const {
  getManageableEventDraft,
  isFeatureEnabled,
  loadCompletionWorkspace,
  notFound,
  randomUUID,
  redirectToActiveLocale,
  requireAnyRole,
  setRequestLocale,
} = vi.hoisted(() => ({
  getManageableEventDraft: vi.fn(),
  isFeatureEnabled: vi.fn(),
  loadCompletionWorkspace: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  randomUUID: vi.fn(),
  redirectToActiveLocale: vi.fn(() => { throw new Error("REDIRECT"); }),
  requireAnyRole: vi.fn(),
  setRequestLocale: vi.fn(),
}));

vi.mock("node:crypto", () => ({ randomUUID }));
vi.mock("next-intl/server", () => ({ setRequestLocale }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/lib/platform/repository", () => ({ getManageableEventDraft }));
vi.mock("@/lib/completion/workspace", () => ({ loadCompletionWorkspace }));
vi.mock("@/components/v3/completion/CompletionWorkspace", () => ({
  CompletionWorkspace: ({ completionIdempotencyKey, reopenIdempotencyKey, state }: {
    completionIdempotencyKey: string;
    reopenIdempotencyKey: string;
    state: { status: string; event: { name: string } };
  }) => <main data-completion-key={completionIdempotencyKey} data-reopen-key={reopenIdempotencyKey} data-status={state.status}>{state.event.name}</main>,
}));

import CompletionPage from "./page";

const event = {
  id: "event-1",
  name: "Miracle Open",
  slug: "miracle-open",
  formatConfig: null,
  organizerUserId: "org-1",
};
const integrationState = {
  status: "integration_required",
  event: { id: "event-1", name: "Miracle Open", formatLabel: "Not configured" },
};

describe("organizer completion page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFeatureEnabled.mockReturnValue(true);
    requireAnyRole.mockResolvedValue({ id: "org-1", role: "organizer", name: "Organizer" });
    getManageableEventDraft.mockResolvedValue(event);
    loadCompletionWorkspace.mockResolvedValue(integrationState);
    randomUUID.mockReturnValueOnce("11111111-1111-4111-8111-111111111111").mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
  });

  it("redirects a disabled completion route to the localized organizer overview before private data loads", async () => {
    isFeatureEnabled.mockReturnValue(false);

    await expect(CompletionPage({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) })).rejects.toThrow("REDIRECT");
    expect(setRequestLocale).toHaveBeenCalledWith("id");
    expect(redirectToActiveLocale).toHaveBeenCalledWith("/organizer/events/event-1/overview");
    expect(requireAnyRole).not.toHaveBeenCalled();
    expect(getManageableEventDraft).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated visitor before loading any event identity", async () => {
    requireAnyRole.mockResolvedValue(null);

    await expect(CompletionPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) })).rejects.toThrow("REDIRECT");
    expect(redirectToActiveLocale).toHaveBeenCalledWith("/login");
    expect(getManageableEventDraft).not.toHaveBeenCalled();
    expect(loadCompletionWorkspace).not.toHaveBeenCalled();
  });

  it("does not reveal an event missing from the authenticated ownership scope", async () => {
    getManageableEventDraft.mockResolvedValue(null);

    await expect(CompletionPage({ params: Promise.resolve({ locale: "en", eventId: "event-other" }) })).rejects.toThrow("NOT_FOUND");
    expect(getManageableEventDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }), "event-other");
    expect(loadCompletionWorkspace).not.toHaveBeenCalled();
  });

  it("loads only the owned server event and renders the explicit integration state with server UUID keys", async () => {
    const page = await CompletionPage({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) });
    const markup = renderToStaticMarkup(page);

    expect(requireAnyRole).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
    expect(getManageableEventDraft).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }), "event-1");
    expect(loadCompletionWorkspace).toHaveBeenCalledWith(event, "en");
    expect(markup).toContain('data-status="integration_required"');
    expect(markup).toContain('data-completion-key="11111111-1111-4111-8111-111111111111"');
    expect(markup).toContain('data-reopen-key="22222222-2222-4222-8222-222222222222"');
    expect(markup).toContain("Miracle Open");
  });
});
