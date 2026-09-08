type Role = string;

type UserRow = {
  id: string;
  role: Role;
  [key: string]: unknown;
};

type EventRow = {
  id: string;
  organizerUserId: string | null;
  [key: string]: unknown;
};

export type TenantOwnershipDataSource = {
  loadUsers: () => Promise<UserRow[]>;
  loadEvents: () => Promise<EventRow[]>;
};

export type TenantOwnershipPreflightInput = {
  users?: UserRow[];
  events?: EventRow[];
  dataSource?: TenantOwnershipDataSource;
};

export type TenantOwnershipPreflightReport = {
  totalUsers: number;
  totalEvents: number;
  knownUserIds: string[];
  knownOrganizerUserIds: string[];
  legacyRoleUserIds: string[];
  adminUserIds: string[];
  nullOwnerEventIds: string[];
  missingOwnerUserEventIds: string[];
  invalidOwnerRoleEventIds: string[];
  hasAnomalies: boolean;
};

export type OwnershipMappingContract = {
  orphanEventOwners: Record<string, string>;
  legacyAdminUserIds: string[];
};

export type OwnershipMappingValidation = {
  missingEventIds: string[];
  unknownEventIds: string[];
  unknownUserIds: string[];
  nonOrganizerUserIds: string[];
  unknownLegacyAdminUserIds: string[];
  invalidLegacyAdminRoleUserIds: string[];
  unresolvedAdminUserIds: string[];
  isValid: boolean;
  isActionable: boolean;
};

const ALLOWED_OWNER_ROLES = new Set(["organizer", "platform_admin"]);
const LEGACY_ADMIN_ROLE = "admin";
const PLATFORM_ADMIN_ROLE = "platform_admin";
const ORGANIZER_ROLE = "organizer";
const REMEDIABLE_LEGACY_ROLES = new Set([LEGACY_ADMIN_ROLE, PLATFORM_ADMIN_ROLE]);

function sorted(values: Iterable<string>) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

async function resolveRows(input: TenantOwnershipPreflightInput) {
  if (input.dataSource) {
    const [users, events] = await Promise.all([
      input.dataSource.loadUsers(),
      input.dataSource.loadEvents(),
    ]);
    return { users, events };
  }

  return {
    users: input.users ?? [],
    events: input.events ?? [],
  };
}

export async function runTenantOwnershipPreflight(
  input: TenantOwnershipPreflightInput,
): Promise<TenantOwnershipPreflightReport> {
  const { users, events } = await resolveRows(input);

  const userRoleById = new Map(users.map((user) => [user.id, user.role]));

  const adminUserIds = sorted(
    users
      .filter((user) => user.role === LEGACY_ADMIN_ROLE)
      .map((user) => user.id),
  );

  const nullOwnerEventIds = sorted(
    events
      .filter((event) => !event.organizerUserId)
      .map((event) => event.id),
  );

  const missingOwnerUserEventIds = sorted(
    events
      .filter((event) => {
        if (!event.organizerUserId) return false;
        return !userRoleById.has(event.organizerUserId);
      })
      .map((event) => event.id),
  );

  const invalidOwnerRoleEventIds = sorted(
    events
      .filter((event) => {
        if (!event.organizerUserId) return false;
        const role = userRoleById.get(event.organizerUserId);
        if (!role) return false;
        return !ALLOWED_OWNER_ROLES.has(role);
      })
      .map((event) => event.id),
  );

  const hasAnomalies =
    adminUserIds.length > 0
    || nullOwnerEventIds.length > 0
    || missingOwnerUserEventIds.length > 0
    || invalidOwnerRoleEventIds.length > 0;

  return {
    totalUsers: users.length,
    totalEvents: events.length,
    knownUserIds: sorted(users.map((user) => user.id)),
    knownOrganizerUserIds: sorted(
      users.filter((user) => user.role === ORGANIZER_ROLE).map((user) => user.id),
    ),
    legacyRoleUserIds: sorted(
      users
        .filter((user) => REMEDIABLE_LEGACY_ROLES.has(user.role))
        .map((user) => user.id),
    ),
    adminUserIds,
    nullOwnerEventIds,
    missingOwnerUserEventIds,
    invalidOwnerRoleEventIds,
    hasAnomalies,
  };
}

export function evaluateOwnershipMappings(
  report: TenantOwnershipPreflightReport,
  mapping: OwnershipMappingContract,
): OwnershipMappingValidation {
  const orphanEventOwners = mapping.orphanEventOwners;
  const legacyAdminUserIds = mapping.legacyAdminUserIds;
  const orphanIds = new Set(report.nullOwnerEventIds);
  const mappedEventIds = Object.keys(orphanEventOwners);
  const mappedUserIds = Object.values(orphanEventOwners);

  const missingEventIds = sorted(
    report.nullOwnerEventIds.filter((eventId) => !orphanEventOwners[eventId]),
  );

  const unknownEventIds = sorted(
    mappedEventIds.filter((eventId) => !orphanIds.has(eventId)),
  );

  const knownUserIds = new Set(report.knownUserIds);
  const knownOrganizerUserIds = new Set(report.knownOrganizerUserIds);

  const unknownUserIds = sorted(mappedUserIds.filter((userId) => !knownUserIds.has(userId)));

  const nonOrganizerUserIds = sorted(
    mappedUserIds.filter((userId) => knownUserIds.has(userId) && !knownOrganizerUserIds.has(userId)),
  );

  const unknownLegacyAdminUserIds = sorted(
    legacyAdminUserIds.filter((userId) => !knownUserIds.has(userId)),
  );

  const userRoleById = new Map<string, string>();
  for (const userId of report.knownUserIds) {
    if (report.knownOrganizerUserIds.includes(userId)) {
      userRoleById.set(userId, ORGANIZER_ROLE);
      continue;
    }
    if (report.legacyRoleUserIds.includes(userId)) {
      userRoleById.set(userId, PLATFORM_ADMIN_ROLE);
    }
  }

  const invalidLegacyAdminRoleUserIds = sorted(
    legacyAdminUserIds.filter(
      (userId) => knownUserIds.has(userId) && !report.legacyRoleUserIds.includes(userId),
    ),
  );

  const listedLegacyAdminIds = new Set(legacyAdminUserIds);
  const unresolvedAdminUserIds = sorted(
    report.adminUserIds.filter((userId) => !listedLegacyAdminIds.has(userId)),
  );

  const isValid =
    missingEventIds.length === 0
    && unknownEventIds.length === 0
    && unknownUserIds.length === 0
    && nonOrganizerUserIds.length === 0
    && unknownLegacyAdminUserIds.length === 0
    && invalidLegacyAdminRoleUserIds.length === 0;

  const isActionable =
    isValid
    && unresolvedAdminUserIds.length === 0
    && report.missingOwnerUserEventIds.length === 0
    && report.invalidOwnerRoleEventIds.length === 0;

  return {
    missingEventIds,
    unknownEventIds,
    unknownUserIds,
    nonOrganizerUserIds,
    unknownLegacyAdminUserIds,
    invalidLegacyAdminRoleUserIds,
    unresolvedAdminUserIds,
    isValid,
    isActionable,
  };
}

export function decidePreflightExitCode(
  report: TenantOwnershipPreflightReport,
  mappingValidation?: OwnershipMappingValidation,
): 0 | 1 {
  if (!mappingValidation) {
    if (report.hasAnomalies) return 1;
    return 0;
  }

  if (!mappingValidation.isValid) return 1;
  if (!mappingValidation.isActionable) return 1;
  return 0;
}

function lineForIds(label: string, ids: string[]) {
  if (ids.length === 0) return `${label}: 0`;
  return `${label}: ${ids.length} [${ids.join(",")}]`;
}

export function formatPreflightSummary(
  report: TenantOwnershipPreflightReport,
  mappingValidation?: OwnershipMappingValidation,
) {
  const lines = [
    `users: ${report.totalUsers}`,
    `events: ${report.totalEvents}`,
    lineForIds("admins", report.adminUserIds),
    lineForIds("null_owner_events", report.nullOwnerEventIds),
    lineForIds("missing_owner_users", report.missingOwnerUserEventIds),
    lineForIds("invalid_owner_roles", report.invalidOwnerRoleEventIds),
  ];

  if (mappingValidation) {
    lines.push(lineForIds("missing_orphan_mappings", mappingValidation.missingEventIds));
    lines.push(lineForIds("unknown_orphan_event_ids", mappingValidation.unknownEventIds));
    lines.push(lineForIds("unknown_mapping_user_ids", mappingValidation.unknownUserIds));
    lines.push(lineForIds("non_organizer_mapping_user_ids", mappingValidation.nonOrganizerUserIds));
    lines.push(lineForIds("unknown_legacy_admin_user_ids", mappingValidation.unknownLegacyAdminUserIds));
    lines.push(lineForIds("invalid_legacy_admin_role_user_ids", mappingValidation.invalidLegacyAdminRoleUserIds));
    lines.push(lineForIds("unresolved_admin_user_ids", mappingValidation.unresolvedAdminUserIds));
    lines.push(`mapping_valid: ${mappingValidation.isValid}`);
    lines.push(`mapping_actionable: ${mappingValidation.isActionable}`);
  }

  return lines.join("\n");
}
