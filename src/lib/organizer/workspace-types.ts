export type OrganizerEventSection =
  | "overview"
  | "registration"
  | "participants"
  | "competition"
  | "schedule"
  | "match-control"
  | "completion"
  | "announcements"
  | "settings";

export type OrganizerWorkspaceLifecycle =
  | "draft"
  | "registration"
  | "drawing"
  | "ongoing"
  | "finished";

export type OrganizerWorkspacePublication = "private" | "published" | "completed";

export type OrganizerWorkspaceRole = "organizer" | "admin" | "platform_admin";

/** A factual issue that can link an organizer to the route able to resolve it. */
export type OrganizerWorkspaceBlocker = {
  code: string;
  section: OrganizerEventSection;
  message: string;
  href?: string;
};

export type OrganizerWorkspaceSummary = {
  event: { id: string; title: string; game: string; format: string };
  lifecycle: OrganizerWorkspaceLifecycle;
  publication: OrganizerWorkspacePublication;
  role: OrganizerWorkspaceRole;
  capabilities: Record<OrganizerEventSection, boolean>;
  badges: Partial<Record<OrganizerEventSection, number>>;
  blockers: OrganizerWorkspaceBlocker[];
  updatedAt: string;
};
