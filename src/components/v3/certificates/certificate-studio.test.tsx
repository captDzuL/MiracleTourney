// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../messages/en.json";
import idMessages from "../../../../messages/id.json";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "@/lib/certificate/templates/miracle-v3";
const certificateActions = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/actions/certificate-v3-actions", () => ({
  regenerateCertificateAction: vi.fn(), publishCertificateSetAction: vi.fn(), uploadCertificateAssetAction: certificateActions.upload,
}));

import { CertificateStudio, type CertificateStudioState } from "./CertificateStudio";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: navigation.refresh }) }));

const records: Extract<CertificateStudioState, { status: "available" }>["records"] = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType, index) => ({
  certificateType,
  recipient: { id: `recipient-${index}`, name: `Recipient ${index + 1}`, kind: index < 3 ? "team" as const : "player" as const },
  selectedCertificateId: `cert-${certificateType}-2`,
  versions: [
    { id: `cert-${certificateType}-1`, eventId: "event-1", certificateType, recipientId: `recipient-${index}`, completionId: "completion-1", completionVersion: 4, templateVersion: "miracle-v3", version: 1, status: "superseded" as const, imageUrl: `https://blob.example/${certificateType}/v1.png`, publishedUrl: `https://blob.example/${certificateType}/v1.png`, verificationCode: `verify-${certificateType}-1`, publishedAt: "2026-09-11T04:00:00.000Z", supersededByVersion: 2, lastError: null },
    { id: `cert-${certificateType}-2`, eventId: "event-1", certificateType, recipientId: `recipient-${index}`, completionId: "completion-1", completionVersion: 4, templateVersion: "miracle-v3", version: 2, status: "ready" as const, imageUrl: `https://blob.example/${certificateType}/v2.png`, publishedUrl: null, verificationCode: `verify-${certificateType}-2`, publishedAt: null, supersededByVersion: null, lastError: null },
  ],
}));

const available: CertificateStudioState = {
  status: "available",
  event: { id: "event-1", name: "Miracle Open" },
  completionVersion: 4,
  certificateRevision: 2,
  records,
  publication: { version: 1, publishedAt: "2026-09-11T04:00:00.000Z" },
  approvedAssets: [{ id: "asset-1", label: "Team logo", purpose: "certificate_team_logo" }],
};
const integration: CertificateStudioState = {
  status: "integration_required",
  event: { id: "event-1", name: "Miracle Open" },
  completionVersion: null,
  certificateRevision: null,
  records: MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, recipient: null, selectedCertificateId: null, versions: null })),
  publication: null,
  approvedAssets: [],
};
const completionRequired: CertificateStudioState = {
  ...integration,
  status: "completion_required",
  completionVersion: 5,
  certificateRevision: 2,
  completionHref: "/en/organizer/events/event-1/completion",
};

function provider(locale: "en" | "id", child: React.ReactNode) {
  return <NextIntlClientProvider locale={locale} messages={locale === "en" ? enMessages : idMessages} timeZone="Asia/Jakarta">{child}</NextIntlClientProvider>;
}

describe("CertificateStudio", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    navigation.refresh.mockClear(); certificateActions.upload.mockReset();
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  it("renders a known reopened completion as an actionable completion-required state", () => {
    const html = renderToStaticMarkup(provider("en", <CertificateStudio
      generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>}
      publicationKey={crypto.randomUUID()}
      state={completionRequired}
    />));
    expect(html).toContain("Tournament completion required");
    expect(html).toContain('href="/en/organizer/events/event-1/completion"');
    expect(html).not.toContain("Match Day integration is required");
  });

  it("renders exactly seven keyboard-operable certificate type tabs", async () => {
    await act(async () => root.render(provider("en", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>("[role=tab]"));
    expect(tabs).toHaveLength(7);
    expect(tabs.map((tab) => tab.dataset.certificateType)).toEqual(MIRACLE_V3_CERTIFICATE_TYPES);
    tabs[0].focus();
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("switches type and versions without losing the selected version per record", async () => {
    await act(async () => root.render(provider("en", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    const version1 = container.querySelector<HTMLButtonElement>("[data-version='1']")!;
    await act(async () => version1.click());
    expect(container.querySelector("[data-certificate-preview]")?.getAttribute("src")).toContain("champion/v1.png");
    expect(container.textContent).toContain("6 / 7 ready");
    await act(async () => container.querySelector<HTMLButtonElement>("[data-certificate-type='mvp']")!.click());
    await act(async () => container.querySelector<HTMLButtonElement>("[data-version='1']")!.click());
    await act(async () => container.querySelector<HTMLButtonElement>("[data-certificate-type='champion']")!.click());
    expect(container.querySelector("[data-certificate-preview]")?.getAttribute("src")).toContain("champion/v1.png");
  });

  it("renders status, retry failure, published and superseded history in text", () => {
    const withFailure: CertificateStudioState = { ...available, records: available.records.map((record) => record.certificateType === "mvp" ? { ...record, versions: [...record.versions!, { ...record.versions![1], id: "cert-mvp-3", version: 3, status: "failed", imageUrl: "", lastError: "Renderer timed out" }], selectedCertificateId: "cert-mvp-3" } : record) };
    const html = renderToStaticMarkup(provider("en", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={withFailure} />));
    expect(html).toContain("Superseded");
    expect(html).toContain("Published Sep 11, 2026");
    expect(html).toContain("6 / 7 ready");
  });

  it("keeps editor controls and one live region accessible while guides remain preview-only", async () => {
    await act(async () => root.render(provider("en", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    expect(container.querySelectorAll("[aria-live=polite]")).toHaveLength(1);
    expect(container.querySelector("label[for='certificate-placement-error-asset']")).not.toBeNull();
    expect(container.querySelector("select[name=assetId]")?.getAttribute("aria-describedby")).toBe("certificate-placement-error-help");
    expect(container.querySelector("[data-editor-safe-zone]")).not.toBeNull();
    expect(container.querySelector("[data-generated-artifact] [data-editor-safe-zone]")).toBeNull();
  });

  it("submits regeneration and locks after a conflict until refresh", async () => {
    const regenerate = vi.fn().mockResolvedValue({ status: "conflict", code: "stale_version", version: 5 });
    await act(async () => root.render(provider("en", <CertificateStudio regenerateAction={regenerate} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    const button = container.querySelector<HTMLButtonElement>("[data-regenerate-certificate]")!;
    await act(async () => button.click());
    expect(regenerate).toHaveBeenCalledWith(expect.objectContaining({ eventId: "event-1", certificateType: "champion", expectedVersion: 4 }));
    expect(button.disabled).toBe(true);
    expect(container.querySelector("[role=status]")?.textContent).toContain("changed in another session");
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("announces a localized regeneration rate limit", async () => {
    const regenerate = vi.fn().mockResolvedValue({ status: "blocked", code: "rate_limited" });
    await act(async () => root.render(provider("en", <CertificateStudio regenerateAction={regenerate} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    await act(async () => container.querySelector<HTMLButtonElement>("[data-regenerate-certificate]")!.click());
    expect(container.querySelector("[role=status]")?.textContent).toContain("Too many attempts");
  });

  it("publishes the selected ready seven-version set and announces success", async () => {
    const publish = vi.fn().mockResolvedValue({ status: "published", revision: 2, publishedAt: "2026-09-12T04:00:00.000Z" });
    await act(async () => root.render(provider("en", <CertificateStudio publishAction={publish} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey="22222222-2222-4222-8222-222222222222" state={available} />)));
    await act(async () => container.querySelector<HTMLButtonElement>("[data-publish-certificate-set]")!.click());
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ expectedCertificateRevision: 2, selection: expect.arrayContaining([expect.objectContaining({ certificateType: "champion", certificateId: "cert-champion-2" })]) }));
    expect(container.querySelector("[role=status]")?.textContent).toContain("published safely");
    expect(container.querySelector("[data-certificate-publication-revision]")?.textContent).toBe("2");
  });

  it("announces a localized publication rate limit", async () => {
    const publish = vi.fn().mockResolvedValue({ status: "blocked", code: "rate_limited" });
    await act(async () => root.render(provider("id", <CertificateStudio publishAction={publish} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    await act(async () => container.querySelector<HTMLButtonElement>("[data-publish-certificate-set]")!.click());
    expect(container.querySelector("[role=status]")?.textContent).toContain("Terlalu banyak percobaan");
  });

  it("renders publication disabled in pre-hydration markup", () => {
    const html = renderToStaticMarkup(provider("en", <CertificateStudio publishAction={vi.fn()} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />));
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelector<HTMLButtonElement>("[data-publish-certificate-set]")?.disabled).toBe(true);
  });

  it("does not submit publication when clicked before hydration readiness", async () => {
    const publish = vi.fn().mockResolvedValue({ status: "published", revision: 2, publishedAt: "2026-09-12T04:00:00.000Z" });
    const hydrationState: CertificateStudioState = { ...available, publication: null, records: available.records.map((record) => ({ ...record, versions: [record.versions![1]], selectedCertificateId: record.versions![1].id })) };
    const element = provider("en", <CertificateStudio publishAction={publish} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={hydrationState} />);
    const hydrationContainer = document.createElement("div");
    document.body.append(hydrationContainer);
    const root = createRoot(hydrationContainer);
    flushSync(() => root.render(element));
    const button = hydrationContainer.querySelector<HTMLButtonElement>("[data-publish-certificate-set]")!;
    expect(button.disabled).toBe(true);
    button.click();
    expect(publish).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    hydrationContainer.remove();
  });

  it("refreshes persisted failure and rotates the idempotency key for a deliberate retry", async () => {
    const regenerate = vi.fn().mockResolvedValue({ status: "failed", code: "generation_failed", certificateId: "cert-champion-3", certificateType: "champion", version: 3 });
    await act(async () => root.render(provider("en", <CertificateStudio regenerateAction={regenerate} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, `key-${type}-11111111-1111-4111-8111-111111111111`])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    const button = container.querySelector<HTMLButtonElement>("[data-regenerate-certificate]")!;
    await act(async () => button.click());
    await act(async () => button.click());
    expect(regenerate).toHaveBeenCalledTimes(2);
    expect((regenerate.mock.calls[1][0] as { idempotencyKey: string }).idempotencyKey).not.toBe((regenerate.mock.calls[0][0] as { idempotencyKey: string }).idempotencyKey);
    expect(navigation.refresh).toHaveBeenCalled();
    expect(container.querySelector("[role=status]")?.textContent).toContain("Generation failed");
  });

  it("rotates a successful generation key so a second regeneration in the same mount creates a new version", async () => {
    const regenerate = vi.fn().mockResolvedValue({ status: "generated", certificateId: "cert-champion-3", certificateType: "champion", version: 3, imageUrl: "/certificates/3.png" });
    await act(async () => root.render(provider("en", <CertificateStudio regenerateAction={regenerate} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, `key-${type}`])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    const button = container.querySelector<HTMLButtonElement>("[data-regenerate-certificate]")!;
    await act(async () => button.click());
    await act(async () => button.click());
    expect(regenerate).toHaveBeenCalledTimes(2);
    expect((regenerate.mock.calls[1][0] as { idempotencyKey: string }).idempotencyKey).not.toBe((regenerate.mock.calls[0][0] as { idempotencyKey: string }).idempotencyKey);
  });

  it("selects the generated certificate and publishes it after authoritative props refresh", async () => {
    const regenerate = vi.fn().mockResolvedValue({ status: "generated", certificateId: "cert-champion-3", certificateType: "champion", version: 3, imageUrl: "/certificates/3.png" });
    const publish = vi.fn().mockResolvedValue({ status: "published", revision: 2, publishedAt: "2026-09-12T04:00:00.000Z" });
    const props = { regenerateAction: regenerate, publishAction: publish, generationKeys: Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, `key-${type}`])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>, publicationKey: crypto.randomUUID() };
    await act(async () => root.render(provider("en", <CertificateStudio {...props} state={available} />)));
    await act(async () => container.querySelector<HTMLButtonElement>("[data-regenerate-certificate]")!.click());

    const refreshed: CertificateStudioState = { ...available, certificateRevision: 3, records: available.records.map((record) => record.certificateType === "champion" ? { ...record, selectedCertificateId: "cert-champion-2", versions: [...record.versions!, { ...record.versions![1], id: "cert-champion-3", version: 3, imageUrl: "/certificates/3.png", status: "ready" as const }] } : record) };
    await act(async () => root.render(provider("en", <CertificateStudio {...props} state={refreshed} />)));
    await act(async () => container.querySelector<HTMLButtonElement>("[data-publish-certificate-set]")!.click());

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ selection: expect.arrayContaining([{ certificateType: "champion", certificateId: "cert-champion-3" }]) }));
  });

  it("returns localized upload validation failures to the file field and Studio live region", async () => {
    certificateActions.upload.mockResolvedValue({ status: "blocked", code: "invalid_dimensions" });
    await act(async () => root.render(provider("id", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    const file = container.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(file, "files", { configurable: true, value: [new File(["bad"], "logo.png", { type: "image/png" })] });
    await act(async () => file.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(certificateActions.upload).toHaveBeenCalledTimes(1);
    expect(file.getAttribute("aria-invalid")).toBe("true");
    expect(file.getAttribute("aria-describedby")).toBe("certificate-placement-error-upload-error");
    expect(container.querySelector("#certificate-placement-error-upload-error")?.textContent).toMatch(/dimensi/i);
    expect(container.querySelector("[role=status]")?.textContent).toMatch(/dimensi/i);
  });

  it("clears a conflict lock only after authoritative revision props change", async () => {
    const regenerate = vi.fn().mockResolvedValue({ status: "conflict", code: "stale_version", version: 5 });
    const props = { regenerateAction: regenerate, generationKeys: Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>, publicationKey: crypto.randomUUID() };
    await act(async () => root.render(provider("en", <CertificateStudio {...props} state={available} />)));
    const button = container.querySelector<HTMLButtonElement>("[data-regenerate-certificate]")!;
    await act(async () => button.click());
    expect(button.disabled).toBe(true);
    await act(async () => root.render(provider("en", <CertificateStudio {...props} state={{ ...available, completionVersion: 5, certificateRevision: 3 }} />)));
    expect(container.querySelector<HTMLButtonElement>("[data-regenerate-certificate]")!.disabled).toBe(false);
  });

  it("localizes asset roles and associates field errors with invalid placement controls", async () => {
    await act(async () => root.render(provider("id", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />)));
    expect(Array.from(container.querySelectorAll("option")).map((option) => option.textContent)).toContain("Logo tim utama");
    const asset = container.querySelector<HTMLSelectElement>("[name=assetId]")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(asset, "asset-1"); asset.dispatchEvent(new Event("change", { bubbles: true })); });
    const x = container.querySelector<HTMLInputElement>("[name=x]")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(x, "0"); x.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => container.querySelector<HTMLButtonElement>("[data-regenerate-certificate]")!.click());
    expect(x.getAttribute("aria-invalid")).toBe("true");
    expect(x.getAttribute("aria-describedby")).toBe("certificate-placement-error");
    expect(container.querySelector("#certificate-placement-error")?.textContent).toContain("zona aman");
  });

  it("renders a precise non-actionable integration state in both languages", () => {
    for (const [locale, phrase] of [["en", "Match Day integration is required"], ["id", "Integrasi Match Day diperlukan"]] as const) {
      const html = renderToStaticMarkup(provider(locale, <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={integration} />));
      expect(html).toContain(phrase);
      expect(html).toContain("disabled");
    }
  });

  it("uses mobile-first bounded grids and no forced desktop-width canvas", () => {
    const html = renderToStaticMarkup(provider("en", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />));
    expect(html).toContain("min-w-0");
    expect(html).toContain("min-[1100px]:grid-cols");
    expect(html).not.toContain("min-w-[1080px]");
  });

  it("keeps the recipient/status/action surface visible while compacting the organizer layout", () => {
    const html = renderToStaticMarkup(provider("en", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />));
    expect(html).toContain("data-certificate-recipient-selection");
    expect(html).toContain("data-certificate-preview-sticky");
    expect(html).toContain("data-certificate-primary-actions");
    expect(html).toContain("data-certificate-set-status");
    expect(html).toContain("data-certificate-assets");
    expect(html).toContain("data-certificate-history");
    expect(html).not.toContain("data-certificate-event-banner");
  });

  it("keeps the compact studio controls keyboard reachable at the project target size", () => {
    const html = renderToStaticMarkup(provider("en", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />));
    expect((html.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(9);
    expect(html).toContain("miracle-focus-ring");
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("details").length).toBeGreaterThan(0);
    for (const summary of document.querySelectorAll("summary")) {
      expect(summary.classList.contains("min-h-11")).toBe(true);
    }
  });

  it("keeps every visible interactive control at the 44px target size", () => {
    const html = renderToStaticMarkup(provider("en", <CertificateStudio generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey={crypto.randomUUID()} state={available} />));
    const document = new DOMParser().parseFromString(html, "text/html");
    for (const control of document.querySelectorAll("button, a, input:not([type=hidden]), select, summary")) {
      expect(control.classList.contains("min-h-11"), `${control.tagName} ${control.textContent?.trim() || control.getAttribute("name") || "control"}`).toBe(true);
    }
  });
});
