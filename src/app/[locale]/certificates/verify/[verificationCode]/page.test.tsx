import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  setRequestLocale: vi.fn(),
  notFound: vi.fn(() => { throw new Error("not-found"); }),
}));

vi.mock("@/lib/certificate/verification-repository", () => ({
  loadPublishedCertificateVerification: mocks.load,
}));
vi.mock("next-intl/server", () => ({ setRequestLocale: mocks.setRequestLocale }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import CertificateVerificationPage, { metadata } from "./page";

const current = {
  verificationCode: "Verify_Exact-9",
  eventName: "Miracle Cup",
  certificateType: "champion" as const,
  certificateVersion: 2,
  recipientName: "Garuda Nova",
  publishedAt: "2026-09-12T04:00:00.000Z",
  state: "current" as const,
  supersededByVersion: null,
};

describe("localized public certificate verification page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(current);
  });

  it("renders the required public fields for a current English certificate", async () => {
    const html = renderToStaticMarkup(await CertificateVerificationPage({
      params: Promise.resolve({ locale: "en", verificationCode: "Verify_Exact-9" }),
    }));

    expect(mocks.load).toHaveBeenCalledWith("Verify_Exact-9");
    expect(mocks.setRequestLocale).toHaveBeenCalledWith("en");
    expect(html).toContain("Certificate verified");
    expect(html).toContain("Valid · Current version");
    expect(html).toContain("Miracle Cup");
    expect(html).toContain("Champion");
    expect(html).toContain("Garuda Nova");
    expect(html).toContain("Verify_Exact-9");
    expect(html).toContain('dateTime="2026-09-12T04:00:00.000Z"');
    expect(html).toContain("Version 2");
    expect(html).not.toContain("private-event-id");
    expect(metadata.robots).toEqual({ index: false, follow: false, nocache: true });
  });

  it("explains in Indonesian that a superseded certificate remains valid", async () => {
    mocks.load.mockResolvedValue({ ...current, certificateVersion: 1, state: "superseded", supersededByVersion: 2 });

    const html = renderToStaticMarkup(await CertificateVerificationPage({
      params: Promise.resolve({ locale: "id", verificationCode: "Verify_Exact-9" }),
    }));

    expect(html).toContain("Sertifikat terverifikasi");
    expect(html).toContain("Valid · Versi terdahulu");
    expect(html).toContain("Sertifikat ini tetap valid");
    expect(html).toContain("versi 2");
    expect(html).toContain("Juara");
  });

  it.each(["unknown", "malformed", "unpublished"])("uses one private-safe result for %s input", async () => {
    mocks.load.mockResolvedValue(null);

    const html = renderToStaticMarkup(await CertificateVerificationPage({
      params: Promise.resolve({ locale: "en", verificationCode: "private-do-not-echo" }),
    }));

    expect(html).toContain("Certificate not found");
    expect(html).toContain("invalid, unknown, or has not been published");
    expect(html).not.toContain("private-do-not-echo");
    expect(html).not.toContain("Recipient");
  });

  it("rejects an unsupported locale before loading certificate data", async () => {
    await expect(CertificateVerificationPage({
      params: Promise.resolve({ locale: "fr", verificationCode: "Verify_Exact-9" }),
    })).rejects.toThrow("not-found");

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
