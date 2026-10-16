import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";

const SRC_DIR = path.resolve(__dirname, "..");
const USE_SERVER_DIRECTIVE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']/;

function readSource(relativeToSrc: string) {
  return fs.readFileSync(path.join(SRC_DIR, relativeToSrc), "utf8");
}

// Finds every "use server" module by its directive, so the checks keep covering actions after they move between files.
function findServerActionFiles() {
  return fs
    .readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .filter((file) => USE_SERVER_DIRECTIVE.test(fs.readFileSync(path.join(SRC_DIR, file), "utf8")))
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

describe("server action bundle boundaries", () => {
  test("client navigation imports logout from the small session action module", () => {
    const sessionNav = readSource("components/session-nav.tsx");
    const mobileNav = readSource("components/mobile-nav.tsx");

    expect(sessionNav).toContain('from "@/lib/session-actions"');
    expect(mobileNav).toContain('from "@/lib/session-actions"');
    expect(sessionNav).not.toContain('from "@/lib/actions');
    expect(mobileNav).not.toContain('from "@/lib/actions');
  });

  test("the scan finds the server action modules it is meant to guard", () => {
    const files = findServerActionFiles();

    expect(files).toContain("lib/session-actions.ts");
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  test("server actions do not eagerly import Blob or certificate generation modules", () => {
    for (const file of findServerActionFiles()) {
      const source = readSource(file);

      expect(source, file).not.toContain('import { put } from "@vercel/blob"');
      expect(source, file).not.toContain('import { generateCertificateIfFinal } from "@/lib/certificate/generate"');
    }
  });

  test("certificate generation loads Vercel Blob only when an upload is required", () => {
    const certificate = readSource("lib/certificate/generate.ts");

    expect(certificate).not.toContain('import { put } from "@vercel/blob"');
    expect(certificate).toContain('await import("@vercel/blob")');
  });
});
