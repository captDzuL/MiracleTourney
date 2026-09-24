import { beforeEach, describe, expect, it } from "vitest";

import {
  checkLocalRateLimit,
  getLocalRateLimitSizeForTests,
  markLocalRateLimitDenied,
  resetLocalRateLimitForTests,
} from "./rate-limit-local";

describe("bounded local rate-limit fallback", () => {
  beforeEach(() => resetLocalRateLimitForTests());

  it("only denies locally after an authoritative denial and expires that denial", () => {
    const now = 1_000;

    expect(checkLocalRateLimit("login:ip-a", 20, 300_000, now)).toBe(true);
    markLocalRateLimitDenied("login:ip-a", 300_000, now);
    expect(checkLocalRateLimit("login:ip-a", 20, 300_000, now + 1)).toBe(false);
    expect(checkLocalRateLimit("login:ip-a", 20, 300_000, now + 300_000)).toBe(true);
  });

  it("evicts expired entries before the oldest live entry and remains bounded", () => {
    for (let index = 0; index < 2_048; index += 1) {
      expect(checkLocalRateLimit(`key-${index}`, 20, 100, 1_000 + index)).toBe(true);
    }
    markLocalRateLimitDenied("key-0", 100, 3_100);

    expect(checkLocalRateLimit("expired", 20, 100, 10_000)).toBe(true);
    expect(getLocalRateLimitSizeForTests()).toBe(1);

    for (let index = 0; index < 2_048; index += 1) {
      checkLocalRateLimit(`bounded-${index}`, 20, 300_000, 20_000 + index);
    }
    expect(getLocalRateLimitSizeForTests()).toBe(2_048);
  });
});
