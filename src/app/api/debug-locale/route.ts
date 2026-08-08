import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const locale = await getLocale();
  const hdrs = await headers();
  const intlHeader = hdrs.get("x-next-intl-locale");
  const cookieHeader = hdrs.get("cookie");
  return NextResponse.json({ locale, intlHeader, cookieHeader });
}
