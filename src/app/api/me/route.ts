import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { getPendingStatSubmissionCount } from "@/lib/platform/repository";

/** Returns the current session user for client-side nav rendering. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  const pendingCount =
    user.role === "platform_admin" || user.role === "organizer" || user.role === "admin"
      ? await getPendingStatSubmissionCount(user)
      : 0;
  return NextResponse.json({ user: { name: user.name, role: user.role, pendingCount } });
}
