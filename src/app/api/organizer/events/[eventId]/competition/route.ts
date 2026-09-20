import { readCompetitionWorkspace } from "@/lib/competition/workspace-read";
import { getRequestId } from "@/lib/observability/logger";
import { isSafeEntityId, requireSameOrigin } from "@/lib/security/request-guard";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
  const requestId = getRequestId(request);
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  const eventId = (await params).eventId;
  if (!isSafeEntityId(eventId)) {
    return Response.json({ code: "invalid_input", requestId }, { status: 400, headers });
  }
  try { return Response.json(await readCompetitionWorkspace(eventId), { headers }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Unauthorized" ? 401 : /authorized|Password/.test(message) ? 403 : 503;
    const code = status === 401 || status === 403 ? "forbidden" : "internal_error";
    return Response.json({ code, requestId }, { status, headers });
  }
}
