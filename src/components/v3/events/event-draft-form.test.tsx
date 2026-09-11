// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";
import { EventDraftForm } from "./EventDraftForm";
import { FormatConfigurator } from "./FormatConfigurator";
import { PreviewControls } from "./PreviewControls";
import { PublishReadiness } from "./PublishReadiness";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("FormatConfigurator", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("reveals advanced controls only after emitting an authoritative format preset", () => {
    const onChange = vi.fn();
    act(() => root.render(<FormatConfigurator value={null} onChange={onChange} />));

    expect(container.querySelector("fieldset[data-advanced-format]")).toBeNull();
    const options = Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-format-kind]"));
    expect(options.map((option) => option.dataset.formatKind)).toEqual([
      "single_elimination", "double_elimination", "round_robin", "group_playoffs",
    ]);

    act(() => options[3].click());

    expect(onChange).toHaveBeenCalledWith(TOURNAMENT_FORMAT_PRESETS.groupPlayoffs);
    act(() => root.render(<FormatConfigurator value={TOURNAMENT_FORMAT_PRESETS.groupPlayoffs} onChange={onChange} />));
    expect(container.querySelector("fieldset[data-advanced-format]")?.textContent).toContain("Group stage");
    const groupCount = container.querySelector<HTMLSelectElement>('select[name="groupCount"]')!;
    expect(groupCount).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(groupCount, "8");
      groupCount.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: "group_playoffs",
      groupCount: 8,
      qualifiersPerGroup: 1,
    }));
  });

  it("hides advanced format controls while the competition rollback flag is off", () => {
    act(() => root.render(<FormatConfigurator allowAdvanced={false} value={TOURNAMENT_FORMAT_PRESETS.groupPlayoffs} onChange={vi.fn()} />));
    expect(container.querySelector('[data-format-kind="single_elimination"]')).not.toBeNull();
    expect(container.querySelector('[data-format-kind="group_playoffs"]')).toBeNull();
    expect(container.querySelector("fieldset[data-advanced-format]")).toBeNull();
  });
});

describe("EventDraftForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("keeps one setup session visible at a time and advances through the numbered journey", () => {
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      reviewPanel={<div data-review-panel>Review controls</div>}
    />));

    expect(container.querySelector("#section-identity")?.className).not.toContain("hidden");
    expect(container.querySelector("#section-format")?.className).toContain("hidden");
    expect(container.querySelector("[data-live-preview]")).not.toBeNull();
    expect(container.querySelector("[data-workspace-step-controls]")?.textContent).toContain("Step 1 of 5");

    act(() => (container.querySelector("[data-workspace-step-controls] button:last-child") as HTMLButtonElement).click());

    expect(container.querySelector("#section-identity")?.className).toContain("hidden");
    expect(container.querySelector("#section-format")?.className).not.toContain("hidden");
    expect(window.location.hash).toBe("#section-format");
  });

  it("updates the public prize in the live preview before autosave completes", () => {
    window.history.replaceState(null, "", "#section-public");
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null, prizePoolLabel: null }}
      initialRevision={3}
      saveDraft={vi.fn()}
    />));

    const prize = container.querySelector<HTMLInputElement>('input[name="prizePoolLabel"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(prize, "Rp5.000.000 + merchandise");
      prize.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.querySelector("[data-live-preview]")?.textContent).toContain("Hadiah");
    expect(container.querySelector("[data-live-preview]")?.textContent).toContain("Rp5.000.000 + merchandise");
  });

  it("separates a published event notice from its read-only preview", () => {
    act(() => root.render(<EventDraftForm
      editable={false}
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null, prizePoolLabel: "Rp5.000.000" }}
      initialRevision={3}
      locale="id"
    />));

    expect(container.querySelector("[data-event-read-only-unused]")).toBeNull();
    expect(container.querySelector("[data-event-read-only]")?.textContent).toContain("Event sudah diterbitkan");
    expect(container.querySelector("[data-live-preview]")?.textContent).toContain("Rp5.000.000");
    expect(container.querySelector('input[name="prizePoolLabel"]')).toBeNull();
  });
  it("debounces a field edit and advances to the saved server revision", async () => {
    const saveDraft = vi.fn().mockResolvedValue({
      status: "saved", revision: 4, fields: { name: { state: "saved" } },
    });
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));

    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, "Miracle Masters");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Unsaved changes");
    expect(saveDraft).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(600));

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "event-1", expectedRevision: 3, draft: { name: "Miracle Masters" },
    }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Saved");
  });

  it("keeps a newer edit queued while an earlier save is in flight", async () => {
    let resolveFirstSave!: (value: { status: "saved"; revision: number }) => void;
    const saveDraft = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirstSave = resolve; }))
      .mockResolvedValueOnce({ status: "saved", revision: 5 });
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));
    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    const edit = (value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, value);
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });

    edit("Miracle Masters");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    edit("Miracle Masters Final");
    await act(async () => resolveFirstSave({ status: "saved", revision: 4 }));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedRevision: 4, draft: { name: "Miracle Masters Final" },
    }));
  });

  it("distinguishes an event that is no longer editable from a stale-tab conflict", async () => {
    const saveDraft = vi.fn().mockResolvedValue({ status: "not_editable", revision: 4, fields: {} });
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));

    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, "Published event");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(container.querySelector('[role="status"]')?.textContent).toContain("no longer a draft");
  });

  it("shows a retryable error when autosave throws", async () => {
    const saveDraft = vi.fn().mockRejectedValue(new Error("network unavailable"));
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));

    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, "Retry me");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Save failed");
    expect(container.querySelector<HTMLButtonElement>('button[data-retry-save]')).not.toBeNull();
  });

  it("reuses the mutation ID when retrying an uncertain save", async () => {
    const saveDraft = vi.fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ status: "saved", revision: 4, retry: true, fields: {} });
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));

    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, "Retry me");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    const firstMutationId = saveDraft.mock.calls[0][0].mutationId;

    act(() => container.querySelector<HTMLButtonElement>('button[data-retry-save]')!.click());
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1][0]).toMatchObject({ mutationId: firstMutationId, expectedRevision: 3 });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("retries the uncertain in-flight payload before rebasing a newer queued edit", async () => {
    let rejectFirstSave!: (reason: Error) => void;
    const saveDraft = vi.fn()
      .mockReturnValueOnce(new Promise((_, reject) => { rejectFirstSave = reject; }))
      .mockResolvedValueOnce({ status: "saved", revision: 4, retry: true, fields: {} })
      .mockResolvedValueOnce({ status: "saved", revision: 5, fields: {} });
    act(() => root.render(<EventDraftForm eventId="event-1" initialDraft={{ name: "Miracle Open", formatConfig: null }} initialRevision={3} saveDraft={saveDraft} />));
    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    const edit = (value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, value);
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });

    edit("First edit");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    const firstMutationId = saveDraft.mock.calls[0][0].mutationId;
    edit("Newest edit");
    await act(async () => rejectFirstSave(new Error("response lost")));
    act(() => container.querySelector<HTMLButtonElement>('button[data-retry-save]')!.click());
    await act(async () => vi.advanceTimersByTimeAsync(500));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(saveDraft.mock.calls[1][0]).toMatchObject({ mutationId: firstMutationId, expectedRevision: 3, draft: { name: "First edit" } });
    expect(saveDraft.mock.calls[2][0]).toMatchObject({ expectedRevision: 4, draft: { name: "Newest edit" } });
  });

  it("restores a queued edit after reload when an uncertain save advanced the server revision", async () => {
    const firstMutationId = "11111111-1111-4111-8111-111111111111";
    localStorage.setItem("miracle:event-draft:event-1", JSON.stringify({
      revision: 3,
      mutationId: "22222222-2222-4222-8222-222222222222",
      patch: { name: "Newest edit" },
      retryAttempt: { expectedRevision: 3, mutationId: firstMutationId, patch: { name: "First edit" } },
      queuedAfterAttempt: true,
    }));
    const saveDraft = vi.fn()
      .mockResolvedValueOnce({ status: "saved", revision: 4, retry: true, fields: {} })
      .mockResolvedValueOnce({ status: "saved", revision: 5, fields: {} });

    act(() => root.render(<EventDraftForm eventId="event-1" initialDraft={{ name: "First edit", formatConfig: null }} initialRevision={4} saveDraft={saveDraft} />));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(container.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("Newest edit");
    expect(saveDraft.mock.calls[0][0]).toMatchObject({ mutationId: firstMutationId, expectedRevision: 3, draft: { name: "First edit" } });
    expect(saveDraft.mock.calls[1][0]).toMatchObject({ expectedRevision: 4, draft: { name: "Newest edit" } });
    expect(localStorage.getItem("miracle:event-draft:event-1")).toBeNull();
  });

  it("rebases a newer journaled edit after an in-flight save advances the revision", async () => {
    let resolveFirstSave!: (value: { status: "saved"; revision: number; fields: object }) => void;
    const saveDraft = vi.fn().mockReturnValueOnce(new Promise((resolve) => { resolveFirstSave = resolve; }));
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));
    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    const edit = (value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, value);
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });

    edit("First edit");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    edit("Newest edit");
    await act(async () => resolveFirstSave({ status: "saved", revision: 4, fields: {} }));

    expect(JSON.parse(localStorage.getItem("miracle:event-draft:event-1") ?? "null")).toMatchObject({
      revision: 4,
      patch: { name: "Newest edit" },
    });
  });

  it("restores a pending edit after unload and resumes autosave", async () => {
    const saveDraft = vi.fn().mockResolvedValue({ status: "saved", revision: 4, fields: {} });
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));
    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, "Recovered draft");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => root.unmount());

    root = createRoot(container);
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));
    expect(container.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("Recovered draft");

    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 3, draft: { name: "Recovered draft" },
    }));
    expect(localStorage.getItem("miracle:event-draft:event-1")).toBeNull();
  });

  it("organizes identity, format-and-schedule, registration, and public-page fields into contextual sections", () => {
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{
        name: "Miracle Open", slug: "miracle-open", description: "Championship",
        formatConfig: null, registrationOpensAt: null, registrationClosesAt: null,
        eventStartsAt: null, timezone: "Asia/Jakarta", venue: "Online", venueAddress: null,
        registrationFeeRequired: false, registrationFeeAmount: null, logoUrl: null, gameImageUrl: null,
      }}
      initialRevision={3}
      saveDraft={vi.fn()}
    />));

    expect(container.querySelector("#section-identity input[name=slug]")).not.toBeNull();
    expect(container.querySelector("#section-registration input[name=registrationOpensAt]")).not.toBeNull();
    expect(container.querySelector("#section-registration input[name=registrationFeeRequired]")).not.toBeNull();
    expect(container.querySelector("#section-public input[name=eventVisual][type=file]")).not.toBeNull();
    expect(container.querySelector("#section-public input[name=rightsAttestation][type=checkbox]")).not.toBeNull();
    expect(container.querySelector("#section-public input[name=eventLogo][type=file]")).not.toBeNull();
    expect(Array.from(container.querySelectorAll('[id^="section-"]')).every((section) => section.getAttribute("tabindex") === "-1")).toBe(true);
  });

  it("autosaves schedule values as UTC for the selected event timezone", async () => {
    const saveDraft = vi.fn().mockResolvedValue({ status: "saved", revision: 4, fields: {} });
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null, timezone: "Asia/Jakarta" }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));

    const eventStartsAt = container.querySelector<HTMLInputElement>('input[name="eventStartsAt"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(eventStartsAt, "2026-09-20T09:00");
      eventStartsAt.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(eventStartsAt.value).toBe("2026-09-20T09:00");

    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft: { eventStartsAt: "2026-09-20T02:00:00.000Z" },
    }));
  });

  it("preserves schedule wall times when the event timezone changes", async () => {
    const saveDraft = vi.fn().mockResolvedValue({ status: "saved", revision: 4, fields: {} });
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{
        name: "Miracle Open", formatConfig: null, timezone: "Asia/Jakarta",
        eventStartsAt: "2026-09-20T09:00",
      }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));

    const timezone = container.querySelector<HTMLInputElement | HTMLSelectElement>('[name="timezone"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(timezone), "value")?.set?.call(timezone, "Asia/Makassar");
      timezone.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(container.querySelector<HTMLInputElement>('[name="eventStartsAt"]')?.value).toBe("2026-09-20T09:00");
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft: { timezone: "Asia/Makassar", eventStartsAt: "2026-09-20T01:00:00.000Z" },
    }));
  });

  it("restores a journaled UTC schedule edit as event-local wall time", async () => {
    const saveDraft = vi.fn().mockResolvedValue({ status: "saved", revision: 4, fields: {} });
    localStorage.setItem("miracle:event-draft:event-1", JSON.stringify({
      revision: 3,
      patch: { eventStartsAt: "2026-09-20T02:00:00.000Z", timezone: "Asia/Jakarta" },
    }));
    act(() => root.render(<EventDraftForm
      eventId="event-1"
      initialDraft={{ name: "Miracle Open", formatConfig: null, timezone: "Asia/Jakarta" }}
      initialRevision={3}
      saveDraft={saveDraft}
    />));

    expect(container.querySelector<HTMLInputElement>('input[name="eventStartsAt"]')?.value)
      .toBe("2026-09-20T09:00");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft: { eventStartsAt: "2026-09-20T02:00:00.000Z", timezone: "Asia/Jakarta" },
    }));
  });

  it("disables locked revision fields and explains why", () => {
    act(() => root.render(<EventDraftForm
      editorLabel="Revisi privat"
      eventId="event-1"
      fieldLocks={{ name: "matches_exist", slug: "slug_published" }}
      initialDraft={{ name: "Miracle Open", slug: "miracle-open", formatConfig: null }}
      initialRevision={2}
      journalNamespace="event-edit-revision"
      saveDraft={vi.fn()}
      saveTargetId="revision-1"
    />));
    expect(container.querySelector<HTMLInputElement>('input[name="name"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[name="slug"]')?.disabled).toBe(true);
    expect(container.querySelector('[data-field-lock="name"]')?.textContent).toContain("Pertandingan sudah dibuat");
    expect(container.querySelector('[data-live-preview]')?.textContent).toContain("Revisi privat");
  });

});

describe("PreviewControls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the newly created private URL and removes it after revocation", async () => {
    const createPreview = vi.fn().mockResolvedValue({
      status: "created", url: "/en/preview/events/secret", expiresAt: new Date("2026-09-07T00:00:00Z"),
    });
    const revokePreview = vi.fn().mockResolvedValue({ status: "revoked", count: 1 });
    act(() => root.render(<PreviewControls
      createPreview={createPreview}
      eventId="event-1"
      locale="en"
      revokePreview={revokePreview}
    />));

    await act(async () => container.querySelector<HTMLButtonElement>("button[data-create-preview]")!.click());
    expect(container.querySelector<HTMLAnchorElement>('a[href="/en/preview/events/secret"]')).not.toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>("button[data-revoke-preview]")!.click());
    expect(revokePreview).toHaveBeenCalledWith({ eventId: "event-1" });
    expect(container.querySelector('a[href="/en/preview/events/secret"]')).toBeNull();
  });
});

describe("PublishReadiness", () => {
  it("groups blockers by workspace section and enables publish only when ready", () => {
    const blocked = renderToStaticMarkup(<PublishReadiness readiness={{
      ready: false,
      incomplete: [
        { code: "name", field: "name", section: "identity" },
        { code: "registration_date_order", field: "registrationClosesAt", section: "schedule" },
      ],
      notices: [],
    }} />);
    expect(blocked).toContain("Identity");
    expect(blocked).toContain("Schedule");
    const host = document.createElement("div");
    host.innerHTML = blocked;
    expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);

    const ready = renderToStaticMarkup(<PublishReadiness eventId="event-1" readiness={{ ready: true, incomplete: [], notices: [] }} />);
    expect(ready).toContain("Ready to publish");
    host.innerHTML = ready;
    expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
  });

  it("publishes a ready event through the authenticated action", async () => {
    const publishEvent = vi.fn().mockResolvedValue({ status: "published", slug: "miracle-open" });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<PublishReadiness
      eventId="event-1"
      publishEvent={publishEvent}
      readiness={{ ready: true, incomplete: [], notices: [] }}
    />));

    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());

    expect(publishEvent).toHaveBeenCalledWith({ eventId: "event-1" });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Published");
    act(() => root.unmount());
    container.remove();
  });
});
