import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";

describe("server action bundle boundaries", () => {
  test("client event controls import actions without traversing the broad events barrel", () => {
    const eventDraftForm = fs.readFileSync(path.resolve(__dirname, "../components/v3/events/EventDraftForm.tsx"), "utf8");
    const previewControls = fs.readFileSync(path.resolve(__dirname, "../components/v3/events/PreviewControls.tsx"), "utf8");
    const publishReadiness = fs.readFileSync(path.resolve(__dirname, "../components/v3/events/PublishReadiness.tsx"), "utf8");

    expect(eventDraftForm).toContain('from "@/modules/events/actions"');
    expect(previewControls).toContain('from "@/modules/events/actions"');
    expect(publishReadiness).toContain('from "@/modules/events/actions"');
    expect(eventDraftForm).not.toContain('from "@/modules/events"');
    expect(previewControls).not.toContain('from "@/modules/events"');
    expect(publishReadiness).not.toContain('from "@/modules/events"');
  });

  test("client navigation imports logout from the small session action module", () => {
    const sessionNav = fs.readFileSync(path.resolve(__dirname, "../components/session-nav.tsx"), "utf8");
    const mobileNav = fs.readFileSync(path.resolve(__dirname, "../components/mobile-nav.tsx"), "utf8");

    expect(sessionNav).toContain('from "@/lib/session-actions"');
    expect(mobileNav).toContain('from "@/lib/session-actions"');
    expect(sessionNav).not.toContain('from "@/lib/actions"');
    expect(mobileNav).not.toContain('from "@/lib/actions"');
  });

  test("large server actions do not eagerly import Blob or certificate generation modules", () => {
    const actions = fs.readFileSync(path.resolve(__dirname, "./actions.ts"), "utf8");

    expect(actions).not.toContain('import { put } from "@vercel/blob"');
    expect(actions).not.toContain('import { generateCertificateIfFinal } from "@/modules/certificates"');
  });

  test("certificate generation loads Vercel Blob only when an upload is required", () => {
    const certificateRepository = fs.readFileSync(path.resolve(__dirname, "../modules/certificates/repository.ts"), "utf8");

    expect(certificateRepository).not.toContain('import { put } from "@vercel/blob"');
    expect(certificateRepository).toContain('await import("@vercel/blob")');
  });
});
