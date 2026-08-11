import { jwtVerify } from "jose";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { routing } from "./src/i18n/routing";

const JWT_COOKIE = "mfl_token";
const DEFAULT_JWT_SECRET = "miracle-tourney-jwt-secret-change-in-production-32chars-min";

// In-memory rate limiter for login — per edge instance.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const LOCALE_SEGMENT = /^\/(id|en)(?=\/|$)/;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

async function getRole(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(JWT_COOKIE)?.value;
  if (!token) return null;
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret === DEFAULT_JWT_SECRET) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

const intlMiddleware = createMiddleware(routing);

function isCrossSiteUnsafeRequest(request: NextRequest) {
  if (!UNSAFE_METHODS.has(request.method)) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin !== request.nextUrl.origin;
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const localeFromPath = pathname.match(LOCALE_SEGMENT)?.[1] as "id" | "en" | undefined;
  const normalizedPath = localeFromPath ? pathname.replace(LOCALE_SEGMENT, "") || "/" : pathname;
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const activeLocale =
    localeFromPath
    ?? (cookieLocale && routing.locales.includes(cookieLocale as "id" | "en")
      ? (cookieLocale as "id" | "en")
      : routing.defaultLocale);

  const isStaticAsset = pathname.startsWith("/_next") || /\.[^/]+$/.test(pathname);
  const isApiRoute = pathname.startsWith("/api");

  if (!localeFromPath && !isApiRoute && !isStaticAsset) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = pathname === "/" ? `/${activeLocale}` : `/${activeLocale}${pathname}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (!isApiRoute && !isStaticAsset && isCrossSiteUnsafeRequest(request)) {
    return new NextResponse("Cross-site request blocked.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Rate-limit POST to /login (brute-force protection)
  if (normalizedPath === "/login" && request.method === "POST") {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    if (!checkLoginRateLimit(ip)) {
      return new NextResponse("Too many login attempts. Try again in a minute.", {
        status: 429,
        headers: { "Retry-After": "60", "Content-Type": "text/plain" },
      });
    }
  }

  // Route protection — verify JWT and check role
  if (normalizedPath.startsWith("/captain") || normalizedPath.startsWith("/admin")) {
    const role = await getRole(request);
    const requiredRole = normalizedPath.startsWith("/admin") ? "admin" : "captain";

    if (role !== requiredRole) {
      return NextResponse.redirect(new URL(`/${activeLocale}/login`, request.url));
    }
  }

  // Temporary debug endpoint
  if (process.env.NODE_ENV === "development" && normalizedPath === "/_debug_locale") {
    return NextResponse.json({
      cookie: request.cookies.get("NEXT_LOCALE")?.value ?? "(not set)",
      allCookies: request.headers.get("cookie"),
    });
  }

  // Locale detection + cookie management (sets NEXT_LOCALE cookie)
  return intlMiddleware(request);
}

export const config = {
  // Match all routes except API, Next.js internals, and static files
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
