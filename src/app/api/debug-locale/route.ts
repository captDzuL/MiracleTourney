import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getRequestId } from "@/lib/observability/logger";
import { requireSameOrigin } from "@/lib/security/request-guard";

export async function GET(request: Request = new Request("http://localhost/api/debug-locale")) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  const requestId = getRequestId(request);
  const user = await requireRole("platform_admin");
  if (!user) return NextResponse.json({ code: "forbidden", requestId }, { status: 403, headers: { "Cache-Control": "no-store" } });

  const locale = await getLocale();
  const hdrs = await headers();
  const intlHeader = hdrs.get("x-next-intl-locale");
  return NextResponse.json({ locale, intlHeader });
}
