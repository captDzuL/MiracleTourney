import { describe, expect, test } from "vitest";

import { buildAdminPhaseHref, resolveAdminPhase } from "./admin-flow";

describe("admin phase navigation", () => {
  test("defaults to prepare for missing or unknown phase values", () => {
    expect(resolveAdminPhase(undefined)).toBe("prepare");
    expect(resolveAdminPhase("unknown")).toBe("prepare");
  });

  test("accepts only organizer phase values", () => {
    expect(resolveAdminPhase("prepare")).toBe("prepare");
    expect(resolveAdminPhase("registration")).toBe("registration");
    expect(resolveAdminPhase("run")).toBe("run");
    expect(resolveAdminPhase("review")).toBe("review");
  });

  test("keeps legacy import and payment links compatible with the registration workspace", () => {
    expect(resolveAdminPhase("import")).toBe("registration");
    expect(resolveAdminPhase("payments")).toBe("registration");
  });

  test("keeps match selection when switching into the run phase", () => {
    expect(
      buildAdminPhaseHref("run", {
        activeEventId: "event-kuroko-summer",
        matchEventId: "event-kuroko-summer",
        matchId: "match-final",
      }),
    ).toBe("?phase=run&activeEventId=event-kuroko-summer&matchEventId=event-kuroko-summer&matchId=match-final");
  });

  test("drops match selection outside match day phases", () => {
    expect(
      buildAdminPhaseHref("registration", {
        activeEventId: "event-kuroko-summer",
        matchEventId: "event-kuroko-summer",
        matchId: "match-final",
      }),
    ).toBe("?phase=registration&activeEventId=event-kuroko-summer");
  });
});
