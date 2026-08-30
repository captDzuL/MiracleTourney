type FeatureFlag =
  | "premium_event_promotion"
  | "premium_auto_checkin"
  | "premium_analytics_dashboard"
  | "premium_match_scheduling"
  | "premium_notifications"
  | "email_password_reset"
  | "public_visual_v2"
  | "ai_event_art";

const DEFAULTS: Record<FeatureFlag, boolean> = {
  premium_event_promotion: false,
  premium_auto_checkin: false,
  premium_analytics_dashboard: false,
  premium_match_scheduling: false,
  premium_notifications: false,
  email_password_reset: false,
  public_visual_v2: false,
  ai_event_art: false,
};

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const envKey = `FEATURE_FLAG_${flag.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal !== undefined) return envVal === "true";
  return DEFAULTS[flag];
}
