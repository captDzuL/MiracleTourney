import { getCaptainCredentialsForEvent } from "@/lib/platform/repository";
import { requireRole } from "@/lib/auth/session";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: Request) {
  const user = await requireRole("admin");
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) return new Response("Missing eventId", { status: 400 });

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
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="captain-credentials-${eventId}.csv"`,
    },
  });
}
