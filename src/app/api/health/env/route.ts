import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/security/request-guard";
import { getRequestId } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request = new Request("http://localhost/api/health/env")) {
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  const requestId = getRequestId(request);
  const privateHeaders = { "Cache-Control": "no-store, max-age=0", "Vary": "Cookie" };

  let user;
  try {
    user = await requireRole("platform_admin");
  } catch {
    return NextResponse.json({ code: "internal_error", requestId }, { status: 500, headers: privateHeaders });
  }
  if (!user) return NextResponse.json({ code: "forbidden", requestId }, { status: 403, headers: privateHeaders });
  return NextResponse.json(
    { status: "ok" },
    {
      headers: {
        ...privateHeaders,
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
