import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("dashboard loading states", () => {
  it("ships skeleton loading files for admin and captain dashboard routes", () => {
    const routes = [
      ["src", "app", "admin", "loading.tsx"],
      ["src", "app", "[locale]", "admin", "loading.tsx"],
      ["src", "app", "captain", "loading.tsx"],
      ["src", "app", "[locale]", "captain", "loading.tsx"],
      ["src", "app", "captain", "settings", "loading.tsx"],
      ["src", "app", "[locale]", "captain", "settings", "loading.tsx"],
      ["src", "app", "captain", "stats", "loading.tsx"],
      ["src", "app", "[locale]", "captain", "stats", "loading.tsx"],
    ];

    for (const route of routes) {
      const source = readFileSync(join(root, ...route), "utf8");
      expect(source).toContain("@/components/dashboard-loading");
      expect(source).toContain("Loading");
    }
  });

  it("uses pulse skeleton blocks instead of a blank route transition", () => {
    const source = readFileSync(join(root, "src", "components", "dashboard-loading.tsx"), "utf8");

    expect(source).toContain("animate-pulse");
    expect(source).toContain("AdminDashboardLoading");
    expect(source).toContain("CaptainDashboardLoading");
    expect(source).toContain("CaptainStatsLoading");
  });
});
