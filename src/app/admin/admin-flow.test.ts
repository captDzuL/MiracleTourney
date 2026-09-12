import { describe, expect, test } from "vitest";

import { buildAdminPhaseHref, resolveAdminPhase } from "./admin-flow";
import * as adminFlow from "./admin-flow";
import enMessages from "../../../messages/en.json";
import idMessages from "../../../messages/id.json";

describe("admin registration messages", () => {
  test.each([["id", idMessages], ["en", enMessages]])("defines top-level registration phase copy for %s", (_locale, messages) => {
    expect(messages.admin.phases.registration).toMatchObject({ title: expect.any(String), description: expect.any(String) });
    expect(messages.admin.nextActionByPhase.registration).toMatchObject({ title: expect.any(String), description: expect.any(String) });
  });
});
describe("admin workspace access", () => {
  test("lets an organizer enter only the explicitly scoped registration workspace", () => {
    const canUseAdminWorkspace = (adminFlow as typeof adminFlow & {
      canUseAdminWorkspace?: (role: string, scope: string) => boolean;
    }).canUseAdminWorkspace;

    expect(canUseAdminWorkspace).toBeTypeOf("function");
    expect(canUseAdminWorkspace?.("organizer", "organizer_registration")).toBe(true);
    expect(canUseAdminWorkspace?.("organizer", "admin")).toBe(false);
    expect(canUseAdminWorkspace?.("platform_admin", "admin")).toBe(true);
  });
});
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
