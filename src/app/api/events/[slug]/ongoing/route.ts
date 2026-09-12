import { getPublicOngoingEvent } from "@/lib/events/public-ongoing";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const view = await getPublicOngoingEvent(slug);
    if (!view) return Response.json({ error: "Unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const etag = `"${view.stateVersion}"`;
    const headers = { ETag: etag, "Cache-Control": "private, no-cache, must-revalidate" };
    const tags = request.headers.get("if-none-match")?.split(",").map(tag => tag.trim().replace(/^W\//, ""));
    if (tags?.includes(etag) || tags?.includes("*")) return new Response(null, { status: 304, headers });
    return Response.json(view, { headers });
  } catch {
    return Response.json({ error: "Refresh unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
