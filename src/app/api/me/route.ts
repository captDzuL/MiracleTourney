import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, withRouteLog } from "@/lib/observability/logger";
import { getPendingStatSubmissionCount } from "@/lib/platform/repository";
import { requireSameOrigin } from "@/lib/security/request-guard";
import { toPublicError } from "@/lib/security/public-error";

/** Returns the current session user for client-side nav rendering. */
export function GET(): Promise<Response>;
export function GET(request: Request): Promise<Response>;
export async function GET(request?: Request) {
  const resolvedRequest = request ?? new Request("http://localhost/api/me");
  return withRouteLog(resolvedRequest, "api_me", (tracedRequest) => handleGet(tracedRequest));
}

async function handleGet(request: Request) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  const requestId = getRequestId(request);
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ user: null }, { headers });
    const pendingCount =
      user.role === "platform_admin" || user.role === "organizer" || user.role === "admin"
        ? await getPendingStatSubmissionCount(user)
        : 0;
    return NextResponse.json({ user: { name: user.name, role: user.role, pendingCount } }, { headers });
  } catch (error) {
    const publicError = toPublicError(error, requestId);
    return NextResponse.json(publicError.body, { status: publicError.status, headers });
  }
}
