export type WorkspaceActor = Readonly<{
  id: string;
  role: "captain" | "organizer" | "admin" | "platform_admin";
}>;

export type WorkspaceResource = Readonly<{
  eventId: string;
  ownerUserId?: string | null;
}>;

export type AuthorizationDecision =
  | Readonly<{ ok: true; platformAdminException: boolean }>
  | Readonly<{ ok: false; status: 403 | 404; code: "forbidden" }>;

export type AuthorizationAuditRecord = Readonly<{
  actorUserId: string;
  eventId: string;
  reason: "platform_admin_exception";
}>;

type AuthorizationAuditSink = (record: AuthorizationAuditRecord) => void;

let authorizationAuditSink: AuthorizationAuditSink = (record) => {
  console.info("[authorization.audit]", record);
};

/** Installs a narrow audit sink for tests or structured application logging. */
export function setAuthorizationAuditSink(sink: AuthorizationAuditSink | null) {
  authorizationAuditSink = sink ?? ((record) => {
    console.info("[authorization.audit]", record);
  });
}

function forbidden(status: 403 | 404 = 403): AuthorizationDecision {
  return { ok: false, status, code: "forbidden" };
}

/**
 * Applies the shared server-side workspace policy to an already resolved resource.
 * Callers must resolve the resource and its parent event after parsing untrusted IDs,
 * then invoke this guard before reading further data or writing anything.
 */
export function authorizeWorkspaceResource(
  actor: WorkspaceActor | null,
  resource: WorkspaceResource | null,
  eventOwnerUserId: string | null,
): AuthorizationDecision {
  if (!actor) return forbidden();
  if (!resource || !resource.eventId) return forbidden(404);

  if (actor.role === "platform_admin") {
    authorizationAuditSink({
      actorUserId: actor.id,
      eventId: resource.eventId,
      reason: "platform_admin_exception",
    });
    return { ok: true, platformAdminException: true };
  }

  if (actor.role === "admin") return { ok: true, platformAdminException: false };

  if (actor.role === "captain") {
    return resource.ownerUserId === actor.id
      ? { ok: true, platformAdminException: false }
      : forbidden();
  }

  if (!eventOwnerUserId) return forbidden();

  if (actor.role === "organizer") {
    // Child resources may be owned by a captain while remaining inside the
    // organizer's event. The parent event owner is the organizer boundary.
    return eventOwnerUserId === actor.id
      ? { ok: true, platformAdminException: false }
      : forbidden();
  }

  return forbidden();
}
