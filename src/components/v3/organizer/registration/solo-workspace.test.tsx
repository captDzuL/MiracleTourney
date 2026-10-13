// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";
import id from "../../../../../messages/id.json";
import type { CloseSoloPreview, SoloDrawView } from "@/lib/solo/draw-types";
import type { SoloEventSummary } from "@/lib/solo/organizer-read";
import { RegistrationWorkspace } from "./RegistrationWorkspace";

const actions = vi.hoisted(() => ({
  refresh: vi.fn(),
  close: vi.fn(),
  draw: vi.fn(),
  swap: vi.fn(),
  lock: vi.fn(),
  refund: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  teamApprove: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: actions.refresh }) }));
vi.mock("@/lib/actions/registration-v3-actions", () => ({
  approveEventPaymentAction: actions.teamApprove,
  rejectEventPaymentAction: vi.fn(),
  previewEventRegistrationImportAction: vi.fn(),
  commitEventRegistrationImportAction: vi.fn(),
  saveEventQrisDraftAction: vi.fn(),
  publishEventQrisAction: vi.fn(),
}));
vi.mock("@/lib/actions/solo-organizer-actions", () => ({
  closeSoloRegistrationAction: actions.close,
  createSoloDrawAction: actions.draw,
  swapSoloPlayersAction: actions.swap,
  lockSoloDrawAction: actions.lock,
  markSoloRefundedAction: actions.refund,
  approveSoloRegistrationAction: actions.approve,
  rejectSoloRegistrationAction: actions.reject,
}));

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let intlErrors: string[];

beforeEach(() => {
  vi.clearAllMocks();
  intlErrors = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const quota = { required: { quota: 8, held: 5, queued: 2 }, open: { quota: 32, held: 30, queued: 6 } };
const summary = (overrides: Partial<SoloEventSummary> = {}): SoloEventSummary => ({
  eventId: "cup", status: "Registration Closed", participantCap: 8, feeRequired: false, competitionVersion: 3,
  teamsLocked: false, requiredPosition: "Goalkeeper", quota, ...overrides,
});
const registration = (id: string, ign: string, extra = {}) => ({
  id, eventId: "cup", userId: `u-${id}`, ign, uid: `UID-${ign}`, primaryPosition: "Forward", secondaryPosition: null, slotGroup: "open" as const,
  willingCaptain: false, status: "approved" as const, proofImageUrl: null, rejectReason: null, slotHeldAt: null, expiresAt: null,
  approvedAt: null, withdrawnAt: null, refundedAt: null, refundNote: null, version: 1, createdAt: new Date("2026-10-13"), ...extra,
});
const plan = (overrides: Partial<CloseSoloPreview["plan"]> = {}): CloseSoloPreview["plan"] => ({
  teamCount: 6, keeperRegistrationIds: ["k1", "k2", "k3", "k4", "k5", "k6"], emergencyUsedRegistrationIds: ["k6"],
  fieldRegistrationIds: Array.from({ length: 24 }, (_, index) => `f${index}`), unplacedRegistrationIds: ["x1"],
  warnings: [{ code: "team_count_below_cap", detail: { teamCount: 6, participantCap: 8 } }, { code: "unplaced", detail: { count: 1 } }], ...overrides,
});
const preview = (overrides: Partial<CloseSoloPreview> = {}): CloseSoloPreview => ({
  pendingBlockers: [], plan: plan(), willBeUnplaced: [registration("x1", "Spare")], queuedCount: 0, feeRequired: false, competitionVersion: 3, ...overrides,
});
const member = (registrationId: string, ign: string, position: string, isCaptain = false) => ({ registrationId, ign, uid: `UID-${ign}`, position, isCaptain, willingCaptain: isCaptain });
const draw = (overrides: Partial<SoloDrawView> = {}): SoloDrawView => ({
  id: "draw-1", eventId: "cup", version: 2, status: "draft", seed: "abc123", teamCount: 2, unplacedCount: 0, warnings: [], canLock: true,
  createdAt: new Date("2026-10-13"), updatedAt: new Date("2026-10-13T10:00:00.000Z"), lockedAt: null, unplaced: [],
  teams: [
    { index: 1, members: [member("a1", "Kipa1", "Goalkeeper", true), member("a2", "Alfa", "Forward")] },
    { index: 2, members: [member("b1", "Kipa2", "Goalkeeper"), member("b2", "Bravo", "Forward", true)] },
  ],
  ...overrides,
});

type Props = React.ComponentProps<typeof RegistrationWorkspace>;
const baseQuery = { view: "draw" as const, status: "", source: "", q: "", page: 1 };
async function render(props: Partial<Props> & { locale?: "id" | "en" } = {}) {
  const locale = props.locale ?? "id";
  const data = { locale, eventId: "cup", query: baseQuery, capacity: 0, acceptedCount: 0, ...props } as Props;
  await act(async () => root.render(
    <NextIntlClientProvider locale={locale} messages={locale === "id" ? id : en} timeZone="Asia/Jakarta" onError={(error) => intlErrors.push(error.message)}>
      <RegistrationWorkspace {...data} />
    </NextIntlClientProvider>,
  ));
}
const soloProps = (overrides: Partial<NonNullable<Props["solo"]>> & { summary?: SoloEventSummary } = {}) => ({
  solo: { summary: overrides.summary ?? summary(), draw: overrides.draw ?? { preview: preview(), draw: null } },
});
const q = <T extends Element = HTMLElement>(selector: string) => host.querySelector<T>(selector);
const click = async (selector: string) => act(async () => q(selector)!.click());
const text = () => host.textContent ?? "";

describe("a solo event's workspace", () => {
  it.each(["id", "en"] as const)("shows its slots, a draw tab and no spreadsheet import in %s", async (locale) => {
    await render({ locale, ...soloProps() });
    expect(text()).toContain(locale === "id" ? "Slot pemain" : "Player slots");
    expect(text()).toContain(locale === "id" ? "Kiper" : "Goalkeeper");
    expect(text()).toContain(locale === "id" ? "5 dari 8 terisi" : "5 of 8 filled");
    expect(text()).toContain(locale === "id" ? "6 di antrean" : "6 in the queue");
    expect(q('a[data-view="draw"]')?.getAttribute("aria-current")).toBe("page");
    expect(q('a[data-view="import"]')).toBeNull();
    expect(q('[role="progressbar"][aria-valuenow="30"]')).not.toBeNull();
    expect(text()).not.toContain("/ 16");
    expect(intlErrors).toEqual([]);
  });

  it("leaves a team event exactly as it was: import tab, no draw tab, no slots", async () => {
    await render({ query: { ...baseQuery, view: "queue" }, capacity: 16, acceptedCount: 1, queue: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 } });
    expect(q('a[data-view="import"]')).not.toBeNull();
    expect(q('a[data-view="draw"]')).toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(text()).toContain("1 / 16");
  });
});

describe("the player list of a solo event", () => {
  const item = (id: string, ign: string, status: string, extra = {}) => ({
    id, eventId: "cup", teamName: ign, teamTag: "Goalkeeper", captainName: `UID-${ign}`, captainIsPlayer: true, rosterCount: 1,
    source: "solo_registration" as const, status: status as never, createdAt: "2026-10-13", origin: "solo",
    solo: { registrationId: id, version: 4, secondaryPosition: null }, ...extra,
  });
  const queue = (items: unknown[]) => ({ items: items as never, total: items.length, page: 1, pageSize: 25, totalPages: 1 });

  it("reads as players, with a Solo marker, the position in everyday words and the queue as a status", async () => {
    await render({ query: { ...baseQuery, view: "queue" }, ...soloProps(), queue: queue([
      item("r1", "Bima", "queued"),
      item("r2", "Sari", "pending_review", { solo: { registrationId: "r2", version: 1, secondaryPosition: "Goalkeeper" }, teamTag: "Forward" }),
    ]) });
    const headers = [...host.querySelectorAll("th")].map((cell) => cell.textContent);
    expect(headers).toEqual(["Pemain", "UID", "Posisi", "Status", "Sumber", "Tindakan"]);
    expect(text()).toContain("Bima");
    expect(text()).toContain("UID-Bima");
    expect(text()).toContain("Kiper");
    expect(text()).toContain("Antrean");
    expect(text()).toContain("Pemain solo");
    expect(text()).toContain("Cadangan: Kiper");
    expect(host.querySelector('label')?.textContent).toContain("Cari IGN atau UID");
    expect(intlErrors).toEqual([]);
  });

  it("links to payment review only for players who have a payment to settle", async () => {
    await render({ query: { ...baseQuery, view: "queue" }, ...soloProps(), queue: queue([item("r1", "Bima", "queued"), item("r2", "Sari", "pending_review"), item("r3", "Dewi", "accepted")]) });
    const links = [...host.querySelectorAll("tbody tr")].map((row) => row.querySelector('a[href*="view=payments"]') !== null);
    expect(links).toEqual([false, true, false]);
  });

  it("calls a player whose time ran out expired, not in need of correction", async () => {
    await render({ query: { ...baseQuery, view: "queue" }, ...soloProps(), queue: queue([item("r1", "Bima", "expired")]) });
    expect(host.querySelector("tbody")?.textContent).toContain("Kedaluwarsa");
    expect(host.querySelector("tbody")?.textContent).not.toContain("Perlu perbaikan");
    const options = [...q<HTMLSelectElement>('select[name="status"]')!.options].map((option) => option.value);
    expect(options).toContain("expired");
    expect(options).not.toContain("needs_correction");
  });

  it("filters by solo statuses and the solo source only", async () => {
    await render({ query: { ...baseQuery, view: "queue" }, ...soloProps(), queue: queue([]) });
    const statuses = [...q<HTMLSelectElement>('select[name="status"]')!.options].map((option) => option.value);
    expect(statuses).toEqual(expect.arrayContaining(["queued", "withdrawn", "pending_review", "accepted"]));
    expect(statuses).not.toContain("draft");
    expect([...q<HTMLSelectElement>('select[name="source"]')!.options].map((option) => option.value)).toEqual(["", "solo_registration"]);
    expect(text()).toContain("Tidak ada pemain yang sesuai");
  });

  it("keeps team filters free of queue statuses and the solo source", async () => {
    await render({ query: { ...baseQuery, view: "queue" }, queue: queue([]) });
    expect([...q<HTMLSelectElement>('select[name="status"]')!.options].map((option) => option.value)).not.toContain("queued");
    expect([...q<HTMLSelectElement>('select[name="source"]')!.options].map((option) => option.value)).not.toContain("solo_registration");
  });
});

describe("payment review of a solo player", () => {
  const entry = (overrides = {}) => ({
    id: "r1", eventId: "cup", captainId: "u1", teamName: "Bima", teamTag: "Forward", status: "pending_review" as const,
    proofImageUrl: "/payment-proofs/p.png", createdAt: new Date("2026-10-13"), updatedAt: new Date("2026-10-13"), expiresAt: new Date("2026-10-14"),
    captain: { id: "u1", name: "UID-Bima" }, solo: { registrationId: "r1", version: 7, uid: "UID-Bima", position: "Forward" }, ...overrides,
  });
  const open = (overrides = {}) => render({ query: { ...baseQuery, view: "payments" }, ...soloProps(), payments: [entry(overrides)] });
  const typeReason = (value: string) => act(() => {
    const field = q<HTMLTextAreaElement>("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it("shows the in-game name, the UID and the Solo marker", async () => {
    await open();
    const detail = q("aside")!;
    expect(detail.textContent).toContain("Bima");
    expect(detail.textContent).toContain("UID-Bima");
    expect(detail.textContent).toContain("Solo");
    expect(detail.textContent).toContain("UID");
  });

  it("approves through the solo action with the registration version, not the team action", async () => {
    actions.approve.mockResolvedValue({ status: "ok", message: "Pembayaran disetujui." });
    await open();
    await click("[data-approve]");
    const data = actions.approve.mock.calls[0][0] as FormData;
    expect(data.get("registrationId")).toBe("r1");
    expect(data.get("version")).toBe("7");
    expect(actions.teamApprove).not.toHaveBeenCalled();
    expect(text()).toContain("Keputusan pemeriksaan disimpan.");
  });

  it("needs a reason to reject, then sends it with the version", async () => {
    actions.reject.mockResolvedValue({ status: "ok", message: "Pembayaran ditolak." });
    await open();
    await click("[data-reject]");
    expect(actions.reject).not.toHaveBeenCalled();
    typeReason("Bukti buram");
    await click("[data-reject]");
    const data = actions.reject.mock.calls[0][0] as FormData;
    expect(data.get("reason")).toBe("Bukti buram");
    expect(data.get("version")).toBe("7");
  });

  it("shows the refusal of the server and reloads on stale data", async () => {
    actions.approve.mockResolvedValue({ status: "conflict", message: "Data sudah berubah. Muat ulang halaman." });
    await open();
    await click("[data-approve]");
    expect(text()).toContain("Data sudah berubah. Muat ulang halaman.");
    expect(actions.refresh).toHaveBeenCalled();
    expect(q<HTMLButtonElement>("[data-approve]")!.disabled).toBe(true);
  });
});

describe("the draw tab", () => {
  it("lets the organizer close registration, and says why drawing has to wait", async () => {
    await render(soloProps({ summary: summary({ status: "Published" }) }));
    expect(q<HTMLButtonElement>("[data-close-registration]")!.disabled).toBe(false);
    expect(q<HTMLButtonElement>("[data-draw]")!.disabled).toBe(true);
    expect(text()).toContain("Tutup pendaftaran dulu.");
    expect(intlErrors).toEqual([]);
  });

  it.each(["id", "en"] as const)("counts who is ready, and explains each warning in %s", async (locale) => {
    await render({ locale, ...soloProps() });
    const list = q("dl")!.textContent!;
    expect(list).toContain(locale === "id" ? "Kiper diterima5" : "Goalkeeper accepted5");
    expect(list).toContain(locale === "id" ? "Kiper darurat dipakai1" : "Emergency Goalkeeper used1");
    expect(list).toContain(locale === "id" ? "6 dari 8" : "6 of 8");
    expect(text()).toContain(locale === "id" ? "Hanya 6 dari 8 tim yang bisa dibentuk" : "Only 6 of 8 teams can form");
    expect(text()).toContain(locale === "id" ? "1 pemain tidak masuk tim." : "1 players are left out.");
    expect(text()).not.toContain("perlu refund.");
    expect(intlErrors).toEqual([]);
  });

  it("explains an unreadable draw: not enough players for two teams", async () => {
    await render(soloProps({ draw: { preview: preview({ plan: plan({ teamCount: 1 }) }), draw: null } }));
    expect(q<HTMLButtonElement>("[data-draw]")!.disabled).toBe(true);
    expect(text()).toContain("Perlu minimal 2 tim.");
  });

  it("draws on request and refreshes the page", async () => {
    actions.draw.mockResolvedValue({ status: "ok", message: "Tim diacak." });
    await render(soloProps());
    expect(q<HTMLButtonElement>("[data-draw]")!.textContent).toBe("Acak tim");
    await click("[data-draw]");
    expect((actions.draw.mock.calls[0][0] as FormData).get("eventId")).toBe("cup");
    expect(actions.refresh).toHaveBeenCalled();
    expect(text()).toContain("Tim diacak.");
  });

  it("shows a refusal as an alert and does not refresh", async () => {
    actions.draw.mockResolvedValue({ status: "failed", message: "Pemain yang diterima belum cukup untuk membentuk 2 tim." });
    await render(soloProps());
    await click("[data-draw]");
    expect(q('[role="alert"]')?.textContent).toContain("belum cukup");
    expect(actions.refresh).not.toHaveBeenCalled();
  });

  describe("closing registration", () => {
    const open = async (value: CloseSoloPreview) => {
      await render(soloProps({ summary: summary({ status: "Published" }), draw: { preview: value, draw: null } }));
      await click("[data-close-registration]");
    };

    it("is blocked, with a link to payments, while a payment is open", async () => {
      await open(preview({ pendingBlockers: [registration("p1", "Wait", { status: "pending_review" })], willBeUnplaced: [] }));
      const dialog = q('[role="dialog"]')!;
      expect(dialog.textContent).toContain("Selesaikan 1 pembayaran dulu");
      expect(dialog.querySelector('a[href*="view=payments"]')).not.toBeNull();
      expect(dialog.querySelector<HTMLButtonElement>("[data-confirm-close]")!.disabled).toBe(true);
    });

    it("needs every player who is left out ticked, and passes them with the version it was shown", async () => {
      actions.close.mockResolvedValue({ status: "ok", message: "Pendaftaran ditutup." });
      await open(preview({ willBeUnplaced: [registration("x1", "Spare"), registration("x2", "Extra")], queuedCount: 4, feeRequired: true }));
      const dialog = q('[role="dialog"]')!;
      expect(dialog.textContent).toContain("Refund mereka secara manual");
      expect(dialog.textContent).toContain("4 pemain di antrean akan dilepas");
      const confirm = () => q<HTMLButtonElement>("[data-confirm-close]")!;
      expect(confirm().disabled).toBe(true);
      const boxes = dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      await act(async () => boxes[0].click());
      expect(confirm().disabled).toBe(true);
      await act(async () => boxes[1].click());
      expect(confirm().disabled).toBe(false);
      await click("[data-confirm-close]");
      const data = actions.close.mock.calls[0][0] as FormData;
      expect(data.get("eventId")).toBe("cup");
      expect(data.get("expectedVersion")).toBe("3");
      expect(data.getAll("confirmRefundId")).toEqual(["x1", "x2"]);
      expect(actions.refresh).toHaveBeenCalled();
      expect(q('[role="dialog"]')).toBeNull();
    });

    it("closes straight away when everybody fits, and can be cancelled", async () => {
      await open(preview({ willBeUnplaced: [], plan: plan({ unplacedRegistrationIds: [], warnings: [] }) }));
      expect(q<HTMLButtonElement>("[data-confirm-close]")!.disabled).toBe(false);
      await act(async () => q<HTMLButtonElement>('[role="dialog"] button:not([data-confirm-close]):not([data-close-dialog])')!.click());
      expect(q('[role="dialog"]')).toBeNull();
      expect(actions.close).not.toHaveBeenCalled();
    });

    it("tells a free event's organizer there is nothing to refund", async () => {
      await open(preview({ feeRequired: false }));
      expect(q('[role="dialog"]')!.textContent).toContain("Centang untuk lanjut.");
      expect(q('[role="dialog"]')!.textContent).not.toContain("Refund mereka");
    });
  });

  describe("a draft draw", () => {
    const open = (value: SoloDrawView = draw(), preview_: CloseSoloPreview | null = preview()) => render(soloProps({ draw: { preview: preview_, draw: value } }));
    const member_ = (selector: string) => q<HTMLButtonElement>(`[data-member="${selector}"]`)!;

    it("lists each warning once: in the draw, not again in the ready panel", async () => {
      await open(draw({ warnings: [{ code: "unplaced", detail: { count: 1 } }] }));
      expect(text().split("1 pemain tidak masuk tim.").length - 1).toBe(1);
    });

    it("lists the teams with captain and position, and the seed", async () => {
      await open();
      expect(text()).toContain("Hasil acak versi 2");
      expect(text()).toContain("Seed: abc123");
      expect(text()).toContain("Tim 1");
      expect(text()).toContain("Kipa1");
      expect(text()).toContain("Kiper");
      expect(host.querySelectorAll("article")).toHaveLength(2);
      expect([...host.querySelectorAll("article")].filter((article) => article.textContent?.includes("Kapten"))).toHaveLength(2);
      expect(q<HTMLButtonElement>("[data-draw]")!.textContent).toBe("Acak ulang");
    });

    it("swaps two players of different teams", async () => {
      actions.swap.mockResolvedValue({ status: "ok", message: "Pemain ditukar." });
      await open();
      const swap = () => q<HTMLButtonElement>("[data-swap]")!;
      expect(swap().disabled).toBe(true);
      expect(text()).toContain("Pilih dua pemain dari tim berbeda untuk ditukar.");
      await act(async () => member_("a2").click());
      expect(member_("a2").getAttribute("aria-pressed")).toBe("true");
      expect(text()).toContain("1 dari 2 dipilih");
      await act(async () => member_("b2").click());
      expect(swap().disabled).toBe(false);
      await click("[data-swap]");
      const data = actions.swap.mock.calls[0][0] as FormData;
      expect([data.get("drawId"), data.get("a"), data.get("b")]).toEqual(["draw-1", "a2", "b2"]);
      expect(data.get("expectedUpdatedAt")).toBe("2026-10-13T10:00:00.000Z");
      expect(actions.refresh).toHaveBeenCalled();
    });

    it("reads each player out with the swap instructions, and keeps the player's own text as the name", async () => {
      await open();
      const button = member_("a2");
      expect(button.hasAttribute("aria-label")).toBe(false);
      expect(button.getAttribute("aria-describedby")).toBe("solo-swap-hint");
      expect(host.querySelector("#solo-swap-hint")?.textContent).toContain("Pilih dua pemain");
      expect(button.textContent).toContain("Alfa");
      expect(button.textContent).toContain("Forward");
    });

    it("asks before drawing over a draft, and does nothing when the organizer backs out", async () => {
      actions.draw.mockResolvedValue({ status: "ok", message: "Tim diacak." });
      await open();
      await click("[data-draw]");
      const dialog = q('[role="dialog"]')!;
      expect(dialog.textContent).toContain("Pertukaran yang sudah kamu buat hilang.");
      expect(actions.draw).not.toHaveBeenCalled();
      await act(async () => [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Batal")!.click());
      expect(q('[role="dialog"]')).toBeNull();
      expect(actions.draw).not.toHaveBeenCalled();
      await click("[data-draw]");
      await click("[data-confirm-redraw]");
      expect((actions.draw.mock.calls[0][0] as FormData).get("eventId")).toBe("cup");
      expect(q('[role="dialog"]')).toBeNull();
    });

    it("draws at once, without asking, when there is no draft yet", async () => {
      actions.draw.mockResolvedValue({ status: "ok", message: "Tim diacak." });
      await render(soloProps());
      await click("[data-draw]");
      expect(q('[role="dialog"]')).toBeNull();
      expect(actions.draw).toHaveBeenCalledTimes(1);
    });

    it.each(["swap", "lock"] as const)("reloads when somebody else changed the draw first (%s)", async (which) => {
      const stale = { status: "conflict", message: "Data sudah berubah. Tim sudah dikunci. Muat ulang halaman." };
      actions.swap.mockResolvedValue(stale);
      actions.lock.mockResolvedValue(stale);
      await open();
      if (which === "swap") {
        await act(async () => member_("a2").click());
        await act(async () => member_("b2").click());
        await click("[data-swap]");
      } else {
        await click("[data-lock]");
        await click("[data-confirm-lock]");
      }
      expect(text()).toContain("Muat ulang halaman.");
      expect(q('[role="alert"]')).not.toBeNull();
      expect(actions.refresh).toHaveBeenCalled();
    });

    it("does not reload for a plain refusal, and keeps the picks", async () => {
      actions.swap.mockResolvedValue({ status: "failed", message: "Kiper hanya bisa ditukar dengan kiper." });
      await open();
      await act(async () => member_("a2").click());
      await act(async () => member_("b2").click());
      await click("[data-swap]");
      expect(q('[role="alert"]')?.textContent).toContain("Kiper hanya bisa ditukar");
      expect(actions.refresh).not.toHaveBeenCalled();
      expect(member_("a2").getAttribute("aria-pressed")).toBe("true");
    });

    it("does not swap two players of the same team", async () => {
      await open();
      await act(async () => member_("a1").click());
      await act(async () => member_("a2").click());
      expect(q<HTMLButtonElement>("[data-swap]")!.disabled).toBe(true);
    });

    it("keeps the two newest picks when a third is chosen", async () => {
      await open();
      for (const id of ["a1", "a2", "b1"]) await act(async () => member_(id).click());
      expect(member_("a1").getAttribute("aria-pressed")).toBe("false");
      expect(member_("a2").getAttribute("aria-pressed")).toBe("true");
      expect(member_("b1").getAttribute("aria-pressed")).toBe("true");
    });

    it("locks only after a confirmation, and says what that means", async () => {
      actions.lock.mockResolvedValue({ status: "ok", message: "Tim dikunci." });
      await open();
      await click("[data-lock]");
      expect(actions.lock).not.toHaveBeenCalled();
      expect(q('[role="dialog"]')!.textContent).toContain("Setelah ini hasil acak tidak bisa diubah.");
      await click("[data-confirm-lock]");
      const lockData = actions.lock.mock.calls[0][0] as FormData;
      expect(lockData.get("drawId")).toBe("draw-1");
      expect(lockData.get("expectedUpdatedAt")).toBe("2026-10-13T10:00:00.000Z");
      expect(q('[role="dialog"]')).toBeNull();
      expect(actions.refresh).toHaveBeenCalled();
    });

    it("cannot lock a draw with a blocking warning, and shows the warning", async () => {
      await open(draw({ canLock: false, warnings: [{ code: "ign_collision", detail: { team: 2 } }] }));
      expect(q<HTMLButtonElement>("[data-lock]")!.disabled).toBe(true);
      expect(text()).toContain("Tim 2 punya dua pemain dengan IGN yang sama.");
      expect(text()).toContain("Selesaikan peringatan di atas dulu.");
    });
  });

  describe("after teams are locked", () => {
    const open = (overrides: Partial<SoloDrawView> = {}) => render(soloProps({
      summary: summary({ teamsLocked: true }),
      draw: { preview: null, draw: draw({ status: "locked", lockedAt: new Date("2026-10-13"), ...overrides }) },
    }));

    it("is read-only, with a link to the competition", async () => {
      await open();
      expect(text()).toContain("Tim sudah dikunci");
      expect(text()).toContain("2 tim dibuat dari hasil acak versi 2.");
      expect(q("[data-member]")).toBeNull();
      expect(q("[data-draw]")).toBeNull();
      expect(q("[data-lock]")).toBeNull();
      expect(q("[data-close-registration]")).toBeNull();
      expect(q('a[href="/id/organizer/events/cup/competition"]')).not.toBeNull();
      expect(host.querySelectorAll("article")).toHaveLength(2);
      expect(intlErrors).toEqual([]);
    });
  });

  describe("a draft that can no longer change", () => {
    it.each([
      ["the event already has locked teams", { teamsLocked: true }],
      ["the event has started", { status: "Ongoing" }],
      ["registration was reopened", { status: "Published" }],
    ])("offers no swap or lock when %s", async (_name, overrides) => {
      await render(soloProps({ summary: summary(overrides), draw: { preview: null, draw: draw() } }));
      expect(q("[data-member]")).toBeNull();
      expect(q("[data-swap]")).toBeNull();
      expect(q("[data-lock]")).toBeNull();
    });
  });

  describe("refunds", () => {
    it("marks a player as refunded once, only on a paid event", async () => {
      actions.refund.mockResolvedValue({ status: "ok", message: "Refund dicatat." });
      const unplaced = [
        { registrationId: "x1", ign: "Spare", uid: "UID-Spare", primaryPosition: "Forward", refundedAt: null, needsRefund: true },
        { registrationId: "x2", ign: "Extra", uid: "UID-Extra", primaryPosition: "Forward", refundedAt: new Date("2026-10-13"), needsRefund: false },
      ];
      await render(soloProps({ summary: summary({ feeRequired: true }), draw: { preview: preview({ feeRequired: true }), draw: draw({ unplaced, unplacedCount: 2 }) } }));
      expect(text()).toContain("Perlu refund");
      expect(text()).toContain("Sudah refund");
      expect(host.querySelectorAll("[data-refund]")).toHaveLength(1);
      await click('[data-refund="x1"]');
      expect((actions.refund.mock.calls[0][0] as FormData).get("registrationId")).toBe("x1");
    });

    it("says a free event needs none", async () => {
      const unplaced = [{ registrationId: "x1", ign: "Spare", uid: "UID-Spare", primaryPosition: "Forward", refundedAt: null, needsRefund: false }];
      await render(soloProps({ draw: { preview: preview(), draw: draw({ unplaced, unplacedCount: 1 }) } }));
      expect(text()).toContain("Tidak perlu refund, event ini gratis.");
      expect(q("[data-refund]")).toBeNull();
    });

    it("says when every player is in a team", async () => {
      await render(soloProps({ draw: { preview: preview({ willBeUnplaced: [] }), draw: draw() } }));
      expect(text()).toContain("Semua pemain masuk tim.");
    });
  });
});
