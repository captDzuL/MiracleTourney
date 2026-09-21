import { jwtVerify } from "jose";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { routing } from "./i18n/routing";

const JWT_COOKIE = "mfl_token";
const DEFAULT_JWT_SECRET = "miracle-tourney-jwt-secret-change-in-production-32chars-min";

// In-memory rate limiter for login — per edge instance.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const LOCALE_SEGMENT = /^\/(id|en)(?=\/|$)/;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

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

function parseOrigin(value: string | null): string | null {
  if (!value) return null;

  const candidate = value.trim();
  if (!candidate || /[\\\u0000-\u001f\u007f]/.test(candidate)) return null;

  try {
    const url = new URL(candidate);
    if (!HTTP_PROTOCOLS.has(url.protocol) || !url.hostname || url.hostname === "." || url.hostname === ".."
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function parseAuthority(value: string | null, protocol: string): string | null {
  if (!value) return null;

  const authority = value.trim();
  if (!authority || /[,\\/?#@\u0000-\u001f\u007f]/.test(authority)) return null;

  try {
    const url = new URL(`${protocol}//${authority}`);
    if (!HTTP_PROTOCOLS.has(url.protocol) || !url.hostname || url.hostname === "." || url.hostname === ".."
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.host;
  } catch {
    return null;
  }
}

function parseForwardedProtocol(value: string | null): string | null {
  if (!value) return null;

  const protocol = value.trim().toLowerCase();
  if (protocol === "http" || protocol === "https") return `${protocol}:`;
  return null;
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

/**
 * Production trusts only the framework-normalized URL authority. Next dev can
 * expose an internal framework authority while the browser uses a loopback
 * port, so non-production permits that one loopback shape. Forwarded metadata
 * is never authoritative; when present in the loopback fallback it must agree
 * with the browser-visible Host and Origin or the request fails closed.
 */
function getEffectiveOrigin(request: NextRequest): string | null {
  const origin = parseOrigin(request.headers.get("origin"));
  if (!origin) return null;

  if (origin === request.nextUrl.origin) return origin;
  if (process.env.NODE_ENV === "production") return null;

  const originUrl = new URL(origin);
  if (!isLoopbackHostname(originUrl.hostname)) return null;

  const hostHeader = request.headers.get("host");
  const host = parseAuthority(hostHeader, originUrl.protocol);
  if (!hostHeader || !host || host !== originUrl.host) return null;

  const forwardedHostHeader = request.headers.get("x-forwarded-host");
  const forwardedProtocolHeader = request.headers.get("x-forwarded-proto");
  if (Boolean(forwardedHostHeader) !== Boolean(forwardedProtocolHeader)) return null;
  if (forwardedHostHeader && forwardedProtocolHeader) {
    const forwardedHost = parseAuthority(forwardedHostHeader, originUrl.protocol);
    const forwardedProtocol = parseForwardedProtocol(forwardedProtocolHeader);
    if (forwardedHost !== originUrl.host || forwardedProtocol !== originUrl.protocol) return null;
  }

  return origin;
}

function isCrossSiteUnsafeRequest(request: NextRequest) {
  if (!UNSAFE_METHODS.has(request.method)) return false;

  if (!getEffectiveOrigin(request)) return true;
  return request.headers.get("sec-fetch-site") === "cross-site";
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
    const canAccessAdmin = role === "platform_admin" || role === "organizer" || role === "admin";
    const canAccessCaptain = role === "captain";

    if ((normalizedPath.startsWith("/admin") && !canAccessAdmin) || (normalizedPath.startsWith("/captain") && !canAccessCaptain)) {
      return NextResponse.redirect(new URL(`/${activeLocale}/login`, request.url));
    }
  }

  // Temporary debug endpoint
  if (process.env.NODE_ENV === "development" && normalizedPath === "/_debug_locale") {
    return NextResponse.json({ locale: activeLocale });
  }

  // Locale detection + cookie management (sets NEXT_LOCALE cookie)
  return intlMiddleware(request);
}

export const config = {
  // Match all routes except API, Next.js internals, and static files
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
