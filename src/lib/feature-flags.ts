type FeatureFlag =
  | "email_password_reset"
  | "public_visual_v2"
  | "ui_v3_foundation"
  | "organizer_workspace_v3"
  | "registration_workspace_v3"
  | "competition_operations_v3"
  | "completion_workspace_v3"
  | "adaptive_public_event_v3"
  | "public_discovery_v3"
  | "organizer_master_shell_v3";

const DEFAULTS: Record<FeatureFlag, boolean> = {
  email_password_reset: false,
  public_visual_v2: false,
  ui_v3_foundation: false,
  organizer_workspace_v3: false,
  registration_workspace_v3: false,
  competition_operations_v3: false,
  completion_workspace_v3: false,
  adaptive_public_event_v3: false,
  public_discovery_v3: false,
  organizer_master_shell_v3: false,
};

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const envKey = `FEATURE_FLAG_${flag.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal !== undefined) return envVal === "true";
  return DEFAULTS[flag];
}
