import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/security/request-guard";
import { getRequestId } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request = new Request("http://localhost/api/health/env")) {
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  const requestId = getRequestId(request);

  const user = await requireRole("platform_admin");
  if (!user) return NextResponse.json({ code: "forbidden", requestId }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } });
  return NextResponse.json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
