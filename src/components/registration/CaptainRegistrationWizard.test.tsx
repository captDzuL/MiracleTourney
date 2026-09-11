import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("CaptainRegistrationWizard", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "./CaptainRegistrationWizard.tsx"), "utf8");

  it("keeps the approved four-step mockup structure", () => {
    expect(source).toContain("Langkah 1 dari 4");
    expect(source).toContain("Pilih atau buat tim");
    expect(source).toContain("Tinjau data sebelum mendaftar");
    expect(source).toContain("Selesaikan pembayaran");
    expect(source).toContain("Pendaftaran saya");
  });

  it("collects captain IGN, UID, contact and captain-as-player choice", () => {
    expect(source).toContain('name="captainIgn"');
    expect(source).toContain('name="captainUid"');
    expect(source).toContain('name="captainContact"');
    expect(source).toContain('name="captainIsPlayer"');
    expect(source).toContain("Kapten juga pemain inti");
  });

  it("derives core roster slots from the event requirement", () => {
    expect(source).toContain("requiredPlayers - (captainIsPlayer ? 1 : 0)");
    expect(source).toContain('name="playerIgn"');
    expect(source).toContain('name="playerUid"');
    expect(source).toContain('name="playerPosition"');
  });

  it("submits through the native captain registration action", () => {
    expect(source).toContain("captainRegisterEventTeamAction");
    expect(source).toContain("action={captainRegisterEventTeamAction}");
  });

  it("renders the review heading before the roster cards", () => {
    const headingIndex = source.indexOf("Tinjau data sebelum mendaftar");
    const rosterCardsIndex = source.indexOf("key={`review-");
    expect(headingIndex).toBeLessThan(rosterCardsIndex);
  });

  it("validates the visible team and roster fields before opening review", () => {
    expect(source).toContain("reportValidity()");
  });
});
