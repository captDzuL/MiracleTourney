import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const JWT_COOKIE = "mfl_token";
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "miracle-tourney-jwt-secret-change-in-production-32chars-min",
);

// In-memory rate limiter for login — per edge instance.
// Provides meaningful protection against single-IP brute-force; not
// a substitute for a distributed store (Vercel KV) if multi-instance
// attack resistance is required.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

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
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit POST to /login (brute-force protection)
  if (pathname === "/login" && request.method === "POST") {
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
  if (pathname.startsWith("/captain") || pathname.startsWith("/admin")) {
    const role = await getRole(request);
    const requiredRole = pathname.startsWith("/admin") ? "admin" : "captain";

    if (role !== requiredRole) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/captain/:path*", "/admin/:path*"],
};
