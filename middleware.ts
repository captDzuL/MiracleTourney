import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const role = request.cookies.get("mfl_role")?.value;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/captain") && role !== "captain") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/captain/:path*", "/admin/:path*"],
};
