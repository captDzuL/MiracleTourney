import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";

describe("server action bundle boundaries", () => {
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
    expect(actions).not.toContain('import { generateCertificateIfFinal } from "@/lib/certificate/generate"');
  });

  test("certificate generation loads Vercel Blob only when an upload is required", () => {
    const certificate = fs.readFileSync(path.resolve(__dirname, "./certificate/generate.ts"), "utf8");

    expect(certificate).not.toContain('import { put } from "@vercel/blob"');
    expect(certificate).toContain('await import("@vercel/blob")');
  });
});
