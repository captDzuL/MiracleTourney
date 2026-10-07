import enMessages from "../../../messages/en.json";
import idMessages from "../../../messages/id.json";
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

type OrganizerNavigationMessageKey = Exclude<keyof typeof idMessages.organizerMaster.navigation, "certificateStudio">;
type OrganizerNavigationMessages = Record<OrganizerNavigationMessageKey, string>;

const NAVIGATION_MESSAGES: Record<OrganizerLocale, OrganizerNavigationMessages> = {
  id: idMessages.organizerMaster.navigation,
  en: enMessages.organizerMaster.navigation,
};

const SECTION_MESSAGE_KEYS: Record<OrganizerEventSection, OrganizerNavigationMessageKey> = {
  overview: "overview",
  registration: "registration",
  participants: "participants",
  competition: "competition",
  schedule: "schedule",
  "match-control": "matchControl",
  completion: "completion",
  announcements: "announcements",
  settings: "settings",
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
        label: NAVIGATION_MESSAGES[locale][SECTION_MESSAGE_KEYS[section]],
        active: isActivePath(pathname, href),
        ...(badge === undefined ? {} : { badge }),
      };
    });
}
