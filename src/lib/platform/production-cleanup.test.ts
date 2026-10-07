import { describe, expect, test } from "vitest";

import {
  DUMMY_EVENT_TARGET_WHERE,
  hasPublicEventListRequest,
  hasProductionCleanupConfirmation,
  sanitizeDatabaseTarget,
} from "./production-cleanup";

describe("production dummy event cleanup helpers", () => {
  test("targets only the known dummy event slugs and names", () => {
    expect(DUMMY_EVENT_TARGET_WHERE).toEqual({
      OR: [
        { slug: "miracle-league" },
        { name: "Miracle Fast Tour" },
        { slug: { startsWith: "admin-stats-e2e" } },
        { slug: { startsWith: "admin-stats-nav-e2e" } },
        { name: "Admin Stats E2E" },
        { slug: { startsWith: "admin-match-e2e" } },
        { name: "Admin Match E2E" },
        { slug: { in: ["flashpeak-mid-season-cup", "flash-peak-mid-season-cup", "FP-MID-SEASON"] } },
        { name: { in: ["Flash peak Mid Season Cup", "Flashpeak Mid-Season Cup", "Flash Peak Mid Season Cup"] } },
      ],
    });
  });

  test("requires the explicit production cleanup confirmation flag", () => {
    expect(hasProductionCleanupConfirmation(["--confirm-production-cleanup"])).toBe(true);
    expect(hasProductionCleanupConfirmation(["--confirm"])).toBe(false);
    expect(hasProductionCleanupConfirmation([])).toBe(false);
  });

  test("supports an explicit public event listing diagnostic mode", () => {
    expect(hasPublicEventListRequest(["--list-public-events"])).toBe(true);
    expect(hasPublicEventListRequest(["--confirm-production-cleanup"])).toBe(false);
    expect(hasPublicEventListRequest([])).toBe(false);
  });

  test("prints only sanitized database target details", () => {
    expect(
      sanitizeDatabaseTarget(
        "postgresql://user:secret@ep-prod-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toEqual({
      protocol: "postgresql:",
      host: "ep-prod-pooler.c-3.ap-southeast-1.aws.neon.tech",
      database: "neondb",
    });

    expect(sanitizeDatabaseTarget("not a url")).toEqual({
      protocol: "unknown",
      host: "unknown",
      database: "unknown",
    });
  });
});
