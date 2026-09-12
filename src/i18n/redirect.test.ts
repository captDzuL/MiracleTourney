import { describe, expect, it } from "vitest";

import { getLocalizedRedirectPath } from "./redirect";

describe("getLocalizedRedirectPath", () => {
  it("adds the requested locale to an unprefixed application path", () => {
    expect(getLocalizedRedirectPath("/events/mfl-season-3/register", "id")).toBe(
      "/id/events/mfl-season-3/register",
    );
  });

  it("replaces an existing locale instead of prefixing it twice", () => {
    expect(getLocalizedRedirectPath("/en/events/mfl-season-3/register", "id")).toBe(
      "/id/events/mfl-season-3/register",
    );
    expect(getLocalizedRedirectPath("/id/events/mfl-season-3/register", "en")).toBe(
      "/en/events/mfl-season-3/register",
    );
  });

  it("preserves query parameters while normalizing the locale", () => {
    expect(getLocalizedRedirectPath("/id/captain?tab=registration&eventId=event-1", "id")).toBe(
      "/id/captain?tab=registration&eventId=event-1",
    );
  });
});
