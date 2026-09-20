import { assertUserCanManageEvent, getCaptainCredentialsForEvent } from "@/lib/platform/repository";
import { requireRole } from "@/lib/auth/session";
import { authorizeWorkspaceResource, type WorkspaceActor } from "@/lib/security/authorization";
import { getRequestId } from "@/lib/observability/logger";
import { requireSameOrigin, neutralizeSpreadsheetFormula, isSafeEntityId } from "@/lib/security/request-guard";
import { toPublicError } from "@/lib/security/public-error";

function csvEscape(value: string): string {
  const safeValue = neutralizeSpreadsheetFormula(value);

  if (safeValue.includes(",") || safeValue.includes('"') || safeValue.includes("\n")) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

export async function GET(req: Request) {
  const originFailure = requireSameOrigin(req);
  if (originFailure) return originFailure;

  const requestId = getRequestId(req);
  const user =
    await requireRole("platform_admin")
    ?? await requireRole("organizer")
    ?? await requireRole("admin");
  if (!user) return Response.json(
    { code: "forbidden", requestId },
    { status: 401, headers: { "Cache-Control": "no-store", "Vary": "Cookie" } },
  );

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId || !isSafeEntityId(eventId)) {
    const error = toPublicError({ code: "invalid_input" }, requestId);
    return Response.json(error.body, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  const access = authorizeWorkspaceResource(
    user as WorkspaceActor,
    { eventId, ownerUserId: user.role === "organizer" ? user.id : undefined },
    user.role === "organizer" ? user.id : null,
  );
  if (!access.ok) return Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } });
  try {
    await assertUserCanManageEvent(user, eventId);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  let credentials;
  try {
    credentials = await getCaptainCredentialsForEvent(eventId);
  } catch (error) {
    const publicError = toPublicError(error, requestId);
    return Response.json(publicError.body, { status: publicError.status, headers: { "Cache-Control": "no-store" } });
  }

  const lines = [
    "team_name,team_tag,captain_name,captain_contact,login_email,temp_password",
    ...credentials.map((c) =>
      [c.teamName, c.teamTag, c.captainName, c.captainContact, c.email, c.tempPassword]
        .map(csvEscape)
        .join(","),
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="captain-credentials-${eventId}.csv"`,
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
