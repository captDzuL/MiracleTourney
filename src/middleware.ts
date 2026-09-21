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

/**
 * Effective-origin precedence is protocol (single trusted forwarded value,
 * otherwise the framework URL) plus forwarded Host only for the trusted proxy
 * shape (upstream Host is the framework authority and forwarded protocol is
 * present); otherwise Host wins. Missing or conflicting metadata fails closed.
 */
function getEffectiveOrigin(request: NextRequest): string | null {
  const origin = parseOrigin(request.headers.get("origin"));
  if (!origin) return null;

  const frameworkUrl = new URL(request.nextUrl.origin);
  const forwardedProtocolHeader = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocolHeader
    ? parseForwardedProtocol(forwardedProtocolHeader)
    : HTTP_PROTOCOLS.has(frameworkUrl.protocol) ? frameworkUrl.protocol : null;
  if (!protocol) return null;

  const hostHeader = request.headers.get("host");
  const forwardedHostHeader = request.headers.get("x-forwarded-host");
  const host = parseAuthority(hostHeader, protocol);
  const forwardedHost = parseAuthority(forwardedHostHeader, protocol);
  if ((hostHeader && !host) || (forwardedHostHeader && !forwardedHost)) return null;
  if (!host && !forwardedHost && forwardedProtocolHeader) return null;
  if (forwardedHost && !host && !forwardedProtocolHeader) return null;

  const frameworkHost = parseAuthority(frameworkUrl.host, protocol);
  if (!frameworkHost) return null;

  let effectiveHost = frameworkHost;
  if (host && forwardedHost && host !== forwardedHost) {
    if (host !== frameworkHost || !forwardedProtocolHeader) return null;
    effectiveHost = forwardedHost;
  } else if (forwardedHost) {
    effectiveHost = forwardedHost;
  } else if (host) {
    effectiveHost = host;
  }

  return `${protocol}//${effectiveHost}` === origin ? origin : null;
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
