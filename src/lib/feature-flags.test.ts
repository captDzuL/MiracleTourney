import { afterEach, describe, expect, it } from "vitest";

import { isFeatureEnabled } from "./feature-flags";

const OWNED_KEYS = ["FEATURE_FLAG_PUBLIC_VISUAL_V2", "FEATURE_FLAG_AI_EVENT_ART"] as const;

afterEach(() => {
  for (const key of OWNED_KEYS) delete process.env[key];
});

describe("public visual feature flags", () => {
  it("defaults public_visual_v2 to false", () => {
    expect(isFeatureEnabled("public_visual_v2")).toBe(false);
  });

  it("defaults ai_event_art to false", () => {
    expect(isFeatureEnabled("ai_event_art")).toBe(false);
  });

  it("enables public_visual_v2 only for the exact string \"true\"", () => {
    process.env.FEATURE_FLAG_PUBLIC_VISUAL_V2 = "true";
    expect(isFeatureEnabled("public_visual_v2")).toBe(true);

    for (const value of ["TRUE", "1", "yes", "on", " true", ""]) {
      process.env.FEATURE_FLAG_PUBLIC_VISUAL_V2 = value;
      expect(isFeatureEnabled("public_visual_v2")).toBe(false);
    }
  });

  it("enables ai_event_art only for the exact string \"true\"", () => {
    process.env.FEATURE_FLAG_AI_EVENT_ART = "true";
    expect(isFeatureEnabled("ai_event_art")).toBe(true);

    for (const value of ["TRUE", "1", "yes", "on", " true", ""]) {
      process.env.FEATURE_FLAG_AI_EVENT_ART = value;
      expect(isFeatureEnabled("ai_event_art")).toBe(false);
    }
  });

  it("keeps the two flags independent", () => {
    process.env.FEATURE_FLAG_PUBLIC_VISUAL_V2 = "true";
    expect(isFeatureEnabled("ai_event_art")).toBe(false);
  });
});
