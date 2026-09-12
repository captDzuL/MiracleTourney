// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../messages/en.json";
import idMessages from "../../../../messages/id.json";
import { MIRACLE_V3_CERTIFICATE_TYPES } from "@/lib/certificate/templates/miracle-v3";
import { CertificateStudio, type CertificateStudioState } from "./CertificateStudio";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: navigation.refresh }) }));

const records: Extract<CertificateStudioState, { status: "available" }>["records"] = MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType, index) => ({
  certificateType,
  recipient: { id: `recipient-${index}`, name: `Recipient ${index + 1}`, kind: index < 3 ? "team" as const : "player" as const },
  selectedCertificateId: `cert-${certificateType}-2`,
  versions: [
    { id: `cert-${certificateType}-1`, eventId: "event-1", certificateType, recipientId: `recipient-${index}`, version: 1, status: "superseded" as const, imageUrl: `https://blob.example/${certificateType}/v1.png`, publishedUrl: `https://blob.example/${certificateType}/v1.png`, verificationCode: `verify-${certificateType}-1`, publishedAt: "2026-09-11T04:00:00.000Z", supersededByVersion: 2, lastError: null },
    { id: `cert-${certificateType}-2`, eventId: "event-1", certificateType, recipientId: `recipient-${index}`, version: 2, status: "ready" as const, imageUrl: `https://blob.example/${certificateType}/v2.png`, publishedUrl: null, verificationCode: `verify-${certificateType}-2`, publishedAt: null, supersededByVersion: null, lastError: null },
  ],
}));

const available: CertificateStudioState = {
  status: "available",
  event: { id: "event-1", name: "Miracle Open" },
  completionVersion: 4,
  certificateRevision: 2,
  records,
  publication: { version: 1, publishedAt: "2026-09-11T04:00:00.000Z" },
};
const integration: CertificateStudioState = {
  status: "integration_required",
  event: { id: "event-1", name: "Miracle Open" },
  completionVersion: null,
  certificateRevision: null,
  records: MIRACLE_V3_CERTIFICATE_TYPES.map((certificateType) => ({ certificateType, recipient: null, selectedCertificateId: null, versions: null })),
  publication: null,
};

function provider(locale: "en" | "id", child: React.ReactNode) {
  return <NextIntlClientProvider locale={locale} messages={locale === "en" ? enMessages : idMessages} timeZone="Asia/Jakarta">{child}</NextIntlClientProvider>;
}

describe("CertificateStudio", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { navigation.refresh.mockClear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

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
    expect(container.querySelector("label[for='certificate-asset-id']")).not.toBeNull();
    expect(container.querySelector("input[name=assetId]")?.getAttribute("aria-describedby")).toBe("certificate-asset-help");
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

  it("publishes the selected ready seven-version set and announces success", async () => {
    const publish = vi.fn().mockResolvedValue({ status: "published", publicationVersion: 2, publishedAt: "2026-09-12T04:00:00.000Z" });
    await act(async () => root.render(provider("en", <CertificateStudio publishAction={publish} generationKeys={Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, crypto.randomUUID()])) as Record<(typeof MIRACLE_V3_CERTIFICATE_TYPES)[number], string>} publicationKey="22222222-2222-4222-8222-222222222222" state={available} />)));
    await act(async () => container.querySelector<HTMLButtonElement>("[data-publish-certificate-set]")!.click());
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ expectedCertificateRevision: 2, selection: expect.arrayContaining([expect.objectContaining({ certificateType: "champion", certificateId: "cert-champion-2" })]) }));
    expect(container.querySelector("[role=status]")?.textContent).toContain("published safely");
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
});
