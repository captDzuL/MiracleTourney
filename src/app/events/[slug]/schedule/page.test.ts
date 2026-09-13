import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public schedule route", () => {
  it("uses adaptive public phase readers and the filterable WIB schedule board", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "./schedule-page-content.tsx"), "utf8");
    expect(source).toContain("getPublicDrawingEvent");
    expect(source).toContain("getPublicOngoingEvent");
    expect(source).toContain("getPublicFinishedEvent");
    expect(source).toContain("PublicScheduleBoard");
  });

  it("keeps localized and unlocalized schedule routes dynamic", () => {
    const publicRoute = fs.readFileSync(path.resolve(__dirname, "./page.tsx"), "utf8");
    const localizedRoute = fs.readFileSync(path.resolve(__dirname, "../../../[locale]/events/[slug]/schedule/page.tsx"), "utf8");
    expect(publicRoute).toContain('export const dynamic = "force-dynamic"');
    expect(localizedRoute).toContain('export const dynamic = "force-dynamic"');
  });
});
