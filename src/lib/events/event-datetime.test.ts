import { describe, expect, it } from "vitest";

import { eventDateToLocalInput, eventLocalInputToIso } from "./event-datetime";

describe("event datetime conversion", () => {
  it("formats stored UTC in the event timezone", () => {
    expect(eventDateToLocalInput(new Date("2026-09-20T02:00:00.000Z"), "Asia/Jakarta"))
      .toBe("2026-09-20T09:00");
  });

  it("converts an event-local input back to the same UTC instant", () => {
    expect(eventLocalInputToIso("2026-09-20T09:00", "Asia/Jakarta"))
      .toBe("2026-09-20T02:00:00.000Z");
  });

  it("returns null for empty input and rejects invalid timezone names", () => {
    expect(eventLocalInputToIso("", "Asia/Jakarta")).toBeNull();
    expect(() => eventDateToLocalInput(new Date(), "Not/A_Timezone")).toThrow();
  });
});
