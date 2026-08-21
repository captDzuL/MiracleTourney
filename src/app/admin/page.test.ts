import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("admin action buttons", () => {
  test("do not use invisible light-on-light secondary button styling", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).not.toContain(
      'rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5',
    );
  });

  test("shows a match operations section with result entry controls", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain('t("matchTitle")');
    expect(source).toContain('t("saveResult")');
    expect(source).toContain("homeScore");
    expect(source).toContain("awayScore");
  });

  test("lets admin choose which manageable event should receive match results", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("manageableEvents");
    expect(source).toContain("selectedManageableEventId");
    expect(source).toContain('name="eventId"');
    expect(source).toContain('t("changeEvent")');
  });

  test("keeps match management navigation relative to the active locale path", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).not.toContain('action="/admin"');
    expect(source).not.toContain("href={`/admin?");
    expect(source).toContain('action=""');
    expect(source).toContain('href={`?phase=run&matchEventId=${selectedManageableEvent.event.id}&matchId=${match.id}`}');
    expect(source).toContain('href={buildAdminPhaseHref("run", { matchEventId: selectedManageableEvent?.event.id })}');
    expect(source).toContain('href={`?phase=run&activeEventId=${activeEvent?.id ?? ""}&matchEventId=${selectedManageableEvent?.event.id ?? ""}&matchId=${match.id}`}');
  });

  test("exposes organizer brand asset uploads for event and team logos", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("Brand Assets");
    expect(source).toContain("adminUploadEventLogoAction");
    expect(source).toContain("adminUploadEventBackgroundAction");
    expect(source).toContain("adminUploadTeamLogoAction");
  });

  test("lets React manage form encoding for server action forms", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).not.toContain('encType="multipart/form-data"');
  });

  test("exposes public listing settings for event card prize and registration copy", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("Public Listing Settings");
    expect(source).toContain("adminUpdateEventPublicInfoAction");
    expect(source).toContain('name="prizePoolLabel"');
    expect(source).toContain('name="registrationFeeLabel"');
    expect(source).toContain('name="registrationUrl"');
  });

  test("keeps long select values constrained inside responsive form columns", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain('const inputClass = "w-full min-w-0');
    expect(source).toContain('const labelClass = "grid min-w-0');
  });

  test("shows organizer assignment on draft creation for platform admins", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("organizerOptions");
    expect(source).toContain('name="organizerUserId"');
    expect(source).toContain('t("createEventOrganizerLabel")');
  });

  test("uses registration intake wizard instead of the legacy visible CSV importer", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");

    expect(source).toContain("adminPreviewRegistrationImportAction");
    expect(source).toContain("adminCommitRegistrationImportAction");
    expect(source).toContain('process.env.REGISTRATION_INTAKE_V2 !== "false"');
    expect(source).toContain("registrationIntakeV2");
    expect(source).toContain('name="registrationFile"');
    expect(source).toContain('accept=".xlsx,.csv');
    expect(source).not.toContain("importSlugsTitle");
  });
});
