import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  const user = await requireRole("platform_admin");
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });

  const locale = await getLocale();
  const hdrs = await headers();
  const intlHeader = hdrs.get("x-next-intl-locale");
  const cookieHeader = hdrs.get("cookie");
  return NextResponse.json({ locale, intlHeader, cookieHeader });
}
