import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isFeatureEnabled } from "./feature-flags";

const OWNED_KEYS = [
  "FEATURE_FLAG_PUBLIC_VISUAL_V2",
  "FEATURE_FLAG_AI_EVENT_ART",
  "FEATURE_FLAG_UI_V3_FOUNDATION",
  "FEATURE_FLAG_ORGANIZER_WORKSPACE_V3",
  "FEATURE_FLAG_REGISTRATION_WORKSPACE_V3",
  "FEATURE_FLAG_COMPETITION_OPERATIONS_V3",
] as const;

beforeEach(() => {
  for (const key of OWNED_KEYS) delete process.env[key];
});

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

  it("defaults ui_v3_foundation to false", () => {
    expect(isFeatureEnabled("ui_v3_foundation")).toBe(false);
  });

  it("keeps the organizer workspace disabled until it is explicitly enabled", () => {
    expect(isFeatureEnabled("organizer_workspace_v3")).toBe(false);

    process.env.FEATURE_FLAG_ORGANIZER_WORKSPACE_V3 = "true";
    expect(isFeatureEnabled("organizer_workspace_v3")).toBe(true);
  });

  it("keeps the registration workspace disabled until it is explicitly enabled", () => {
    expect(isFeatureEnabled("registration_workspace_v3")).toBe(false);

    process.env.FEATURE_FLAG_REGISTRATION_WORKSPACE_V3 = "true";
    expect(isFeatureEnabled("registration_workspace_v3")).toBe(true);
  });

  it("keeps competition operations disabled until explicitly enabled", () => {
    expect(isFeatureEnabled("competition_operations_v3")).toBe(false);

    process.env.FEATURE_FLAG_COMPETITION_OPERATIONS_V3 = "true";
    expect(isFeatureEnabled("competition_operations_v3")).toBe(true);
  });

  it("enables ui_v3_foundation when the environment override is true", () => {
    process.env.FEATURE_FLAG_UI_V3_FOUNDATION = "true";
    expect(isFeatureEnabled("ui_v3_foundation")).toBe(true);
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
