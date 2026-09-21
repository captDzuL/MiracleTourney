import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getRequestId, withRouteLog } from "@/lib/observability/logger";
import { requireSameOrigin } from "@/lib/security/request-guard";

export function GET(): Promise<Response>;
export function GET(request: Request): Promise<Response>;
export async function GET(request?: Request) {
  const resolvedRequest = request ?? new Request("http://localhost/api/debug-locale");
  return withRouteLog(resolvedRequest, "api_debug_locale", () => handleGet(resolvedRequest));
}

async function handleGet(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
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

  try {
    const locale = await getLocale();
    const hdrs = await headers();
    const intlHeader = hdrs.get("x-next-intl-locale");
    return NextResponse.json({ locale, intlHeader }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ code: "internal_error", requestId }, { status: 500, headers: privateHeaders });
  }
}
