import { readCompetitionWorkspace } from "@/lib/competition/workspace-read";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
  try { return Response.json(await readCompetitionWorkspace((await params).eventId), { headers }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Unauthorized" ? 401 : /authorized|Password/.test(message) ? 403 : message.includes("unavailable") ? 404 : 503;
    return Response.json({ error: status === 503 ? "temporarily_unavailable" : "access_unavailable" }, { status, headers });
  }
}
