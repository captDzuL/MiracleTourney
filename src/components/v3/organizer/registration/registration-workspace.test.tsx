// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import id from "../../../../../messages/id.json";
import { RegistrationWorkspace } from "./RegistrationWorkspace";
const actions = vi.hoisted(() => ({ refresh: vi.fn(), approve: vi.fn(), reject: vi.fn(), preview: vi.fn(), commit: vi.fn(), save: vi.fn(), publish: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: actions.refresh }) }));
vi.mock("@/lib/actions/registration-v3-actions", () => ({ approveEventPaymentAction: actions.approve, rejectEventPaymentAction: actions.reject, previewEventRegistrationImportAction: actions.preview, commitEventRegistrationImportAction: actions.commit, saveEventQrisDraftAction: actions.save, publishEventQrisAction: actions.publish }));
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const record = { id: "team-a", eventId: "cup", teamId: "team-a", teamName: "Alpha", teamTag: "ALP", captainName: "Raka", captainContact: "08123", captainIsPlayer: true, rosterCount: 1, source: "import_csv" as const, status: "accepted" as const, createdAt: "2026-09-15", origin: "import" };
const base = { locale: "en" as const, eventId: "cup", query: { view: "queue" as const, status: "", source: "", q: "", page: 1 }, capacity: 16, acceptedCount: 1, queue: { items: [record], total: 30, page: 1, pageSize: 25, totalPages: 2 }, teams: [{ id: "team-a", name: "Alpha", tag: "ALP", captainName: "Raka", captainContact: "08123", players: [{ nickname: "Raka", displayName: "123", position: "Captain" }] }] };
async function render(props: Partial<React.ComponentProps<typeof RegistrationWorkspace>> = {}) { const data = { ...base, ...props }; await act(async () => root.render(<NextIntlClientProvider locale={data.locale} messages={data.locale === "id" ? id : en} timeZone="Asia/Jakarta"><RegistrationWorkspace {...data} /></NextIntlClientProvider>)); }
async function click(selector: string) { await act(async () => host.querySelector<HTMLElement>(selector)!.click()); }
function input(selector: string, value: string) { const el = host.querySelector<HTMLInputElement>(selector)!; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }); }
const payment = { id: "request-a", eventId: "cup", captainId: "cap", teamName: "Alpha", teamTag: "ALP", status: "pending_review" as const, proofImageUrl: "/payment-proofs/proof.png", createdAt: new Date("2026-09-15"), updatedAt: new Date("2026-09-15"), expiresAt: new Date("2026-09-20"), captain: { id: "cap", name: "Raka" } };
describe("registration workspace behavior", () => {
  it.each(["en", "id"] as const)("gives upload controls route-localized visible and accessible labels in %s", async locale => {
    for (const view of ["import", "qris"] as const) {
      await render({ locale, query: { ...base.query, view }, history: [], qris: { id: "qris", eventId: "cup", source: "event", version: 0, status: "draft" } });
      const file = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      expect(file.getAttribute("aria-label")).toBe(locale === "id" ? "Pilih berkas" : "Choose file");
      expect(file.parentElement?.textContent).toBe(locale === "id" ? "Pilih berkas" : "Choose file");
    }
  });
  it("keeps shared filters in real event-local navigation and pagination", async () => {
    await render({ query: { ...base.query, q: "Alpha", source: "import_csv" } });
    const url = new URL(host.querySelector<HTMLAnchorElement>('a[data-view="payments"]')!.href);
    expect(url.pathname).toBe("/en/organizer/events/cup/registration"); expect(url.searchParams.get("q")).toBe("Alpha"); expect(url.searchParams.get("source")).toBe("import_csv");
    expect(host.querySelector('form[method="get"] input[name="q"]')?.getAttribute("value")).toBe("Alpha");
    expect(host.querySelector('a[data-page="next"]')?.getAttribute("href")).toContain("page=2");
    expect(host.textContent).toContain("1 / 16");
  });
  it("opens roster details, contains keyboard focus, closes with Escape and restores focus", async () => {
    await render(); const trigger = host.querySelector<HTMLButtonElement>('[data-roster="team-a"]')!; trigger.focus(); await click('[data-roster="team-a"]');
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!; expect(dialog.textContent).toContain("123"); expect(dialog.textContent).toContain("Captain");
    const close = dialog.querySelector<HTMLButtonElement>("button")!; expect(document.activeElement).toBe(close);
    act(() => close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it("restores visible filter values when URL state changes", async () => {
    await render({ query: { ...base.query, q: "Alpha" } });
    input('input[name="q"]', "Unsaved search");
    await render({ query: { ...base.query, q: "Beta" } });
    expect(host.querySelector<HTMLInputElement>('input[name="q"]')!.value).toBe("Beta");
  });
  it("shows status filters consistently when crossing queue/payment vocabularies", async () => {
    await render({ query: { ...base.query, status: "approved" } });
    expect(host.querySelector<HTMLSelectElement>('select[name="status"]')!.value).toBe("accepted");
    await render({ query: { ...base.query, view: "payments", status: "needs_correction" }, payments: [{ ...payment, status: "expired" }] });
    expect(host.querySelector<HTMLSelectElement>('select[name="status"]')!.value).toBe("expired");
    expect(host.querySelector("aside")?.textContent).toContain("Alpha");
  });
  it("does not invent zero capacity when a route reader fails", async () => {
    await render({ error: true, capacity: 0, acceptedCount: 0 });
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain("0 / 0");
  });
  it.each(["en", "id"] as const)("renders localized labels and empty states in %s", async locale => {
    await render({ locale, queue: { ...base.queue, items: [], total: 0, totalPages: 1 } });
    expect(host.textContent).toContain(locale === "id" ? "Registrasi peserta" : "Participant registration");
    expect(host.textContent).not.toContain(locale === "id" ? "Payment verification" : "Verifikasi pembayaran");
  });
  it("requires a rejection reason, sends event/version preconditions, and exposes conflicts", async () => {
    actions.reject.mockResolvedValue({ status: "conflict", code: "stale_mutation" });
    await render({ query: { ...base.query, view: "payments" }, payments: [payment] });
    await click('[data-reject]'); expect(actions.reject).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
    const text = host.querySelector<HTMLTextAreaElement>("textarea")!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(text, "Unreadable receipt"); text.dispatchEvent(new Event("input", { bubbles: true })); });
    await click('[data-reject]');
    const form = actions.reject.mock.calls[0][0] as FormData;
    expect(form.get("eventId")).toBe("cup"); expect(form.get("version")).toBe("2026-09-15T00:00:00.000Z"); expect(form.get("reason")).toBe("Unreadable receipt");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("changed"); expect(actions.refresh).toHaveBeenCalled();
    expect(host.querySelector("aside")?.textContent).toContain("Awaiting review");
    expect(host.querySelector("aside")?.textContent).not.toContain("Expired");
  });
  it("zooms proof accessibly and prevents repeat approval after success", async () => {
    actions.approve.mockResolvedValue({ status: "approved" }); await render({ query: { ...base.query, view: "payments" }, payments: [payment] });
    await click('[data-zoom]'); expect(host.querySelector('[role="dialog"] img')?.getAttribute("alt")).toContain("Alpha"); await click('[data-close-dialog]');
    await click('[data-approve]'); expect(host.querySelector<HTMLButtonElement>('[data-approve]')?.disabled).toBe(true);
    expect(host.textContent).toContain("Approved");
  });
  it("does not render unsafe proof URLs", async () => { await render({ query: { ...base.query, view: "payments" }, payments: [{ ...payment, proofImageUrl: "javascript:alert(1)" }] }); expect(host.querySelector("img")).toBeNull(); });
  it("prevents QRIS publication until the edited draft is saved and then uses the new version", async () => {
    actions.save.mockResolvedValue({ status: "saved", version: 3 }); actions.publish.mockResolvedValue({ status: "published", version: 4 });
    await render({ query: { ...base.query, view: "qris" }, qris: { id: "qris", eventId: "cup", source: "event", version: 2, status: "draft", qrisImageUrl: "/event-payment-qris/q.png", instructions: "Pay here" } });
    const text = host.querySelector<HTMLTextAreaElement>("textarea")!; act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(text, "Updated"); text.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.querySelector<HTMLButtonElement>('[data-publish]')!.disabled).toBe(true); await click('[data-save]'); expect(host.querySelector<HTMLButtonElement>('[data-publish]')!.disabled).toBe(false); await click('[data-publish]');
    expect((actions.publish.mock.calls[0][0] as FormData).get("expectedVersion")).toBe("3"); expect(host.textContent).toContain("Visible to captains");
  });
  it("uploads a file, previews row selection, commits only valid selected rows and retains history", async () => {
    actions.preview.mockResolvedValue({ status: "preview_ready", batchId: "batch-1", headers: ["Team"], mapping: { columns: { teamName: 0 }, players: [] }, maxRosterSize: 1, expiresAt: "2099-01-01T00:00:00Z", items: [{ id: "valid", sourceRow: 2, teamName: "Alpha", status: "new", selected: true, issueCount: 0 }, { id: "bad", sourceRow: 3, teamName: "Beta", status: "error", selected: false, issueCount: 1 }] });
    actions.commit.mockResolvedValue({ status: "imported", importedCount: 1 });
    await render({ query: { ...base.query, view: "import" }, history: [] });
    const file = host.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(file, "files", { configurable: true, value: [new File(["Team\nAlpha"], "teams.csv", { type: "text/csv" })] });
    await act(async () => file.dispatchEvent(new Event("change", { bubbles: true }))); await click('[data-preview]');
    expect(host.textContent).toContain("Alpha"); expect(host.querySelector<HTMLInputElement>('input[value="bad"]')!.disabled).toBe(true);
    await click('[data-commit]'); expect((actions.commit.mock.calls[0][0] as FormData).getAll("itemId")).toEqual(["valid"]); expect(host.textContent).toContain("Import completed");
  });
});
