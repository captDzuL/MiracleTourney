import type { OrganizerEventSection, OrganizerWorkspaceSummary } from "./workspace-types";

export type OrganizerLocale = "id" | "en";

export type OrganizerEventNavigationItem = {
  section: OrganizerEventSection;
  href: string;
  label: string;
  active: boolean;
  badge?: number;
};

const EVENT_SECTIONS: readonly OrganizerEventSection[] = [
  "overview",
  "registration",
  "participants",
  "competition",
  "schedule",
  "match-control",
  "completion",
  "announcements",
  "settings",
];

const SECTION_LABELS: Record<OrganizerLocale, Record<OrganizerEventSection, string>> = {
  id: {
    overview: "Ringkasan",
    registration: "Registrasi",
    participants: "Peserta",
    competition: "Kompetisi",
    schedule: "Jadwal",
    "match-control": "Kontrol Pertandingan",
    completion: "Penyelesaian",
    announcements: "Pengumuman",
    settings: "Pengaturan",
  },
  en: {
    overview: "Overview",
    registration: "Registration",
    participants: "Participants",
    competition: "Competition",
    schedule: "Schedule",
    "match-control": "Match Control",
    completion: "Completion",
    announcements: "Announcements",
    settings: "Settings",
  },
};

function routePath(locale: OrganizerLocale, eventId: string, section: OrganizerEventSection) {
  return `/${locale}/organizer/events/${encodeURIComponent(eventId)}/${section}`;
}

function isActivePath(pathname: string, href: string) {
  const currentPath = pathname.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/** Build direct event routes for the shared organizer/admin workspace rail. */
export function buildOrganizerEventNavigation(
  locale: OrganizerLocale,
  eventId: string,
  summary: OrganizerWorkspaceSummary,
  pathname: string,
): OrganizerEventNavigationItem[] {
  return EVENT_SECTIONS
    .filter(section => summary.capabilities[section])
    .map(section => {
      const href = routePath(locale, eventId, section);
      const badge = summary.badges[section];
      return {
        section,
        href,
        label: SECTION_LABELS[locale][section],
        active: isActivePath(pathname, href),
        ...(badge === undefined ? {} : { badge }),
      };
    });
}
