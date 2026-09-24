import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const lifecycleSpec = readFileSync(resolve(root, "tests/e2e/v3-organizer-lifecycle.spec.ts"), "utf8");

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate contract block: ${startMarker}`);
  return source.slice(start, end);
}

describe("organizer lifecycle wizard E2E contracts", () => {
  it("uses the canonical five-step editor with localized wizard controls", () => {
    const lifecycle = sliceBetween(
      lifecycleSpec,
      'test("organizer can create, autosave, preview, revoke, and publish an event"',
      'for (const locale of ["id", "en"] as const)',
    );

    expect(lifecycle).toContain('await page.goto(`/id/organizer/events/${encodeURIComponent(eventId!)}/edit`);');
    expect(lifecycle).toContain('name: "Kembali"');
    expect(lifecycle).toContain('name: "Lanjut"');
    expect(lifecycle).toContain("Langkah ${step} dari 5");
    expect(lifecycle).toContain('getByLabel("Acara dimulai")');
    expect(lifecycle).not.toContain('getByLabel("Event dimulai")');
    expect(lifecycle).toContain("Buat pratinjau");
    expect(lifecycle).toContain("Buka pratinjau");
    expect(lifecycle).toContain("Cabut tautan");
    expect(lifecycle).toContain("Terbitkan acara");
    expect(lifecycle).toContain('main > header dl div');
    expect(lifecycle).toContain('hasText: "Diterbitkan"');
    expect(lifecycle).toContain('toHaveText("Publikasi")');
    expect(lifecycle).toContain('toHaveText("Diterbitkan")');
    expect(lifecycle).not.toContain('getByRole("status").filter({ hasText: "Diterbitkan" })');
    expect(lifecycle).not.toContain('getByRole("link", { name: "Tinjau & Terbitkan" })');
    expect(lifecycle).not.toContain('getByRole("link", { name: "Identitas" })');
    expect(lifecycle).not.toContain('getByRole("link", { name: "Format & Jadwal" })');
    expect(lifecycle).not.toContain('getByRole("link", { name: "Registrasi" })');
    expect(lifecycle).not.toContain('name: "Complete before publishing"');
    expect(lifecycle).not.toContain('name: "Ready to publish"');
    expect(lifecycle).not.toContain('name: "Create preview"');
    expect(lifecycle).not.toContain('name: "Open preview"');
    expect(lifecycle).not.toContain('name: "Revoke link"');
    expect(lifecycle).not.toContain('name: "Publish event"');
  });

  it("enters the canonical editor before checking both locale tablet navigations", () => {
    const tablet = sliceBetween(
      lifecycleSpec,
      "test(`workspace navigation labels fit without overlap at ${locale} tablet widths`",
      'test("workspace stays within a 360px viewport"',
    );

    expect(tablet).toContain('await page.goto(`/${locale}/organizer/events/${encodeURIComponent(eventId!)}/edit`);');
    expect(tablet).toContain('nav:has(a[aria-current="step"])');
    expect(tablet).toContain("locator('a[aria-current=\"step\"]')");
    expect(tablet).toContain("toHaveCount(1)");
    expect(tablet.indexOf("overview$/")).toBeGreaterThanOrEqual(0);
    expect(tablet.indexOf("overview$/")).toBeLessThan(tablet.indexOf('await page.goto(`/${locale}/organizer/events/${encodeURIComponent(eventId!)}/edit`);'));
  });

  it("cleans only exact owner-scoped UI-created events", () => {
    expect(lifecycleSpec).toContain("cleanupCreatedOrganizerEvent");
    expect(lifecycleSpec).toContain("organizerUserId: organizer.id");
    expect(lifecycleSpec).toContain("slug: event.slug");
    expect(lifecycleSpec).not.toContain('slug: { startsWith: "V3 Lifecycle" }');
    expect(lifecycleSpec).not.toContain('slug: { startsWith: "v3-lifecycle" }');
    expect(lifecycleSpec).not.toContain("E2E_DATABASE_RESET_ALLOWED");
  });
});
