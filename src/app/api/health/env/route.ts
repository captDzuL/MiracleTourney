import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/security/request-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request = new Request("http://localhost/api/health/env")) {
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;

  const user = await requireRole("platform_admin");
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } });
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
