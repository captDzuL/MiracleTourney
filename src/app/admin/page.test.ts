import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async () => ({
    id: "admin-commish",
    email: "admin@miraclefc.gg",
    name: "League Commissioner",
    role: "admin",
  })),
}));

import AdminPage from "./page";

describe("admin page team import UI", () => {
  it("renders the team import section with template link and success feedback", async () => {
    const view = await AdminPage({
      searchParams: Promise.resolve({
        success: "teams-imported",
        count: "2",
      }),
    });

    const html = renderToStaticMarkup(view);

    expect(html).toContain("Team import completed: 2 teams imported.");
    expect(html).toContain("Import teams from CSV");
    expect(html).toContain("Upload a roster CSV");
    expect(html).toContain("/templates/team-import-template.csv");
    expect(html).toContain('name="csvFile"');
    expect(html).toContain("Import teams");
  });

  it("renders readable upload errors from admin search params", async () => {
    const view = await AdminPage({
      searchParams: Promise.resolve({
        importError: "Row 2: event missing",
      }),
    });

    const html = renderToStaticMarkup(view);

    expect(html).toContain("Team import failed: Row 2: event missing");
  });

  it("ships the downloadable team import template with the expected header row", () => {
    const templatePath = join(process.cwd(), "public", "templates", "team-import-template.csv");

    expect(() => readFileSync(templatePath, "utf8")).not.toThrow();
    expect(readFileSync(templatePath, "utf8")).toContain(
      "event_slug,team_name,team_tag,captain_name,captain_contact",
    );
  });
});
