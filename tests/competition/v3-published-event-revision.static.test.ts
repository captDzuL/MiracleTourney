import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const englishMessages = readFileSync(resolve(root, "messages/en.json"), "utf8");
const indonesianMessages = readFileSync(resolve(root, "messages/id.json"), "utf8");
const revisionSpec = readFileSync(resolve(root, "tests/e2e/v3-published-event-revision.spec.ts"), "utf8");
const organizerPage = readFileSync(resolve(root, "src/app/[locale]/organizer/page.tsx"), "utf8");

describe("Published event revision localization contracts", () => {
  it("keeps every hardcoded E2E locator aligned with current localized copy", () => {
    for (const [message, locatorCopy] of [
      ['"editEvent": "Edit event"', "Edit event"],
      ['"continueRevision": "Lanjutkan revisi"', "Lanjutkan revisi"],
      ['"description": "Deskripsi singkat"', "Deskripsi singkat"],
      ['"status_saved": "Tersimpan"', "Tersimpan"],
      ['"review": "Tinjau & Terbitkan"', "Tinjau & Terbitkan"],
      ['"revisionPreviewCreate": "Buat pratinjau privat"', "Buat pratinjau privat"],
      ['"revisionPreviewOpen": "Buka pratinjau"', "Buka pratinjau"],
      ['"revisionUpdate": "Perbarui event publik"', "Perbarui event publik"],
      ['"eventNavigation":"Navigasi event"', "Navigasi event"],
      ['"registration": "Registrasi"', "Registrasi"],
      ['"opens": "Pendaftaran dibuka"', "Pendaftaran dibuka"],
      ['"closes": "Pendaftaran ditutup"', "Pendaftaran ditutup"],
      ['"paid": "Pendaftaran berbayar"', "Pendaftaran berbayar"],
      ['"lock_registration_closed": "Pendaftaran sudah ditutup; periode dan biaya tidak dapat diubah."', "Pendaftaran sudah ditutup"],
      ['"public": "Halaman Publik"', "Halaman Publik"],
      ['"prize": "Informasi hadiah"', "Informasi hadiah"],
      ['"eventCannotEdit": "Informasi acara tidak dapat diedit."', "Informasi acara tidak dapat diedit."],
      ['"adminSlug": "URL publik khusus admin platform"', "URL publik khusus admin platform"],
      ['"changeSlug": "Ganti URL dan buat pengalihan"', "Ganti URL dan buat pengalihan"],
    ] as const) {
      expect(indonesianMessages).toContain(message);
      expect(revisionSpec).toContain(locatorCopy);
    }
    expect(englishMessages).toContain('"editEvent": "Edit event"');
    expect(englishMessages).toContain('"title": "Page Not Found"');
    expect(indonesianMessages).toContain('"title": "Halaman Tidak Ditemukan"');
    expect(revisionSpec).toContain('name: /Edit event|Lanjutkan revisi/');
    expect(revisionSpec).toContain('name: /not found|halaman tidak ditemukan/i');
    expect(revisionSpec).toContain('name: "Buka workspace"');
    expect(organizerPage).toContain('"Buka workspace"');

    for (const staleCopy of [
      'name: "Buat preview privat"',
      'name: "Buka preview"',
      'name: "Informasi event tidak dapat diedit."',
      'getByLabel("URL publik khusus Platform Admin")',
      'name: "Ganti URL dan buat redirect"',
    ]) expect(revisionSpec).not.toContain(staleCopy);
  });
});
