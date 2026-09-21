import { getPublicOngoingEvent } from "@/lib/events/public-ongoing";
import { getRequestId, withRouteLog } from "@/lib/observability/logger";
import { isSafeEntityId, requireSameOrigin } from "@/lib/security/request-guard";
import { toPublicError } from "@/lib/security/public-error";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return withRouteLog(request, "api_events_ongoing", () => handleGet(request, { params }));
}

async function handleGet(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;

  const requestId = getRequestId(request);
  const { slug } = await params;
  if (!isSafeEntityId(slug)) {
    const publicError = toPublicError({ code: "invalid_input" }, requestId);
    return Response.json(publicError.body, { status: publicError.status, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const view = await getPublicOngoingEvent(slug);
    if (!view) return Response.json(
      { code: "internal_error", requestId },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
    const etag = `"${view.stateVersion}"`;
    const headers = { ETag: etag, "Cache-Control": "private, no-cache, must-revalidate" };
    const tags = request.headers.get("if-none-match")?.split(",").map(tag => tag.trim().replace(/^W\//, ""));
    if (tags?.includes(etag) || tags?.includes("*")) return new Response(null, { status: 304, headers });
    return Response.json(view, { headers });
  } catch (error) {
    const publicError = toPublicError(error, requestId);
    return Response.json(publicError.body, { status: publicError.status, headers: { "Cache-Control": "no-store" } });
  }
}
