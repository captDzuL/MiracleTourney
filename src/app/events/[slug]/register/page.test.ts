import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("native event registration route", () => {
  it("renders the shared captain registration page", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");
    expect(source).toContain("renderEventRegistrationPage");
  });

  it("has a localized wrapper", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../../[locale]/events/[slug]/register/page.tsx"), "utf8");
    expect(source).toContain("setRequestLocale");
    expect(source).toContain("renderEventRegistrationPage");
  });

  it("pres the approved registration experience to real data", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./event-registration-page.tsx"), "utf8");
    expect(source).toContain("CaptainRegistrationWizard");
    expect(source).toContain("getPublicEventBySlug");
    expect(source).toContain("getSessionUser");
    expect(source).toContain("getGameModeConfig");
  });
});
