import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getRequestId, withRouteLog } from "@/lib/observability/logger";
import { syncTeamCompletion } from "@/lib/registration/completion-repository";

export const dynamic = "force-dynamic";
/** One run walks every open event and sends the emails one by one. */
export const maxDuration = 300;

const privateHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive" };

function hasValidSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Called by Vercel Cron once a day, with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  return withRouteLog(request, "api_cron_team_completion", async (tracedRequest) => {
    const requestId = getRequestId(tracedRequest);
    if (!hasValidSecret(tracedRequest)) {
      return NextResponse.json({ code: "unauthorized", requestId }, { status: 401, headers: privateHeaders });
    }
    const result = await syncTeamCompletion();
    return NextResponse.json({ status: "ok", ...result }, { headers: privateHeaders });
  });
}
