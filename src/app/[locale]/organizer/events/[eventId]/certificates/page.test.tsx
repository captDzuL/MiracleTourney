import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ flag: vi.fn(), session: vi.fn(), event: vi.fn(), load: vi.fn(), redirect: vi.fn(), notFound: vi.fn(() => { throw new Error("not-found"); }) }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.flag }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: mocks.session }));
vi.mock("@/lib/platform/repository", () => ({ getManageableEventDraft: mocks.event }));
vi.mock("@/lib/certificate/studio-repository", () => ({ loadCertificateStudioState: mocks.load }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale: mocks.redirect }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("@/components/v3/certificates/CertificateStudio", () => ({ CertificateStudio: (props: unknown) => props }));
import Page from "./page";

describe("Certificate Studio page", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.flag.mockReturnValue(true);
    mocks.session.mockResolvedValue({ id: "org-1", role: "organizer", mustChangePassword: false });
    mocks.event.mockResolvedValue({ id: "event-1", name: "Miracle Open", organizerUserId: "org-1" });
    mocks.load.mockResolvedValue({ status: "integration_required", event: { id: "event-1", name: "Miracle Open" }, records: [] });
  });
  it("enforces the feature flag before loading organizer state", async () => {
    mocks.flag.mockReturnValue(false);
    await Page({ params: Promise.resolve({ locale: "en", eventId: "event-1" }) });
    expect(mocks.redirect).toHaveBeenCalledWith("/organizer/events/event-1/overview");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("requires a manageable organizer event and loads only the Completion snapshot adapter", async () => {
    await Page({ params: Promise.resolve({ locale: "id", eventId: "event-1" }) });
    expect(mocks.session).toHaveBeenCalledWith(["organizer", "platform_admin", "admin"]);
    expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ id: "org-1" }), "event-1");
    expect(mocks.load).toHaveBeenCalledWith({ id: "event-1", name: "Miracle Open" }, "id");
  });
});
