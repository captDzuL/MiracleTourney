import { assertUserCanManageEvent, getCaptainCredentialsForEvent } from "@/lib/platform/repository";
import { requireRole } from "@/lib/auth/session";

function csvEscape(value: string): string {
  const safeValue = /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;

  if (safeValue.includes(",") || safeValue.includes('"') || safeValue.includes("\n")) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

function isSafeEventId(eventId: string) {
  return /^[a-zA-Z0-9_-]+$/.test(eventId);
}

export async function GET(req: Request) {
  const user =
    await requireRole("platform_admin")
    ?? await requireRole("organizer")
    ?? await requireRole("admin");
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) return new Response("Missing eventId", { status: 400 });
  if (!isSafeEventId(eventId)) return new Response("Invalid eventId", { status: 400 });
  await assertUserCanManageEvent(user, eventId);

  const credentials = await getCaptainCredentialsForEvent(eventId);

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
