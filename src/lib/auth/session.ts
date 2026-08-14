import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

import { getUserWithPasswordByEmail, getCaptainById, getUserByEmail } from "@/lib/platform/repository";
import type { AppUser, UserRole } from "@/lib/platform/types";

const JWT_COOKIE = "mfl_token";
const DEFAULT_JWT_SECRET = "miracle-tourney-jwt-secret-change-in-production-32chars-min";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;
const CAPTAIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret || secret === DEFAULT_JWT_SECRET) {
    throw new Error("JWT_SECRET must be set to a unique non-default value.");
  }

  return new TextEncoder().encode(secret);
}

function getSessionMaxAge(role: string) {
  return role === "admin" || role === "platform_admin" ? ADMIN_SESSION_MAX_AGE : CAPTAIN_SESSION_MAX_AGE;
}

async function signToken(payload: { sub: string; role: string }, maxAge: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(getJwtSecret());
}

async function verifyToken(token: string): Promise<{ sub: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

/** Returns the currently authenticated user from the JWT cookie, or null if unauthenticated. Result is memoised per request via React cache. */
export const getSessionUser = cache(async (): Promise<AppUser | null> => {
  const store = await cookies();
  const token = store.get(JWT_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyToken(token);
  if (!claims) return null;

  const captain = await getCaptainById(claims.sub);
  if (captain) return captain;

  return getUserByEmail(claims.sub) ?? null;
});

/**
 * Validates credentials and sets a 7-day HttpOnly JWT cookie on success.
 * Returns `{ ok: true, user }` or `{ ok: false, error }` — never throws.
 */
export async function signIn(email: string, password: string) {
  const user = await getUserWithPasswordByEmail(email);

  if (!user) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  const maxAge = getSessionMaxAge(user.role);
  const token = await signToken({ sub: user.id, role: user.role }, maxAge);
  const store = await cookies();
  store.set(JWT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  const { passwordHash: _, ...publicUser } = user;
  return { ok: true as const, user: publicUser };
}

/** Clears the JWT cookie, effectively logging out the current user. */
export async function signOut() {
  const store = await cookies();
  store.set(JWT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Returns the session user if they hold `role`, otherwise null. Use in server components and actions to gate access. */
export async function requireRole(role: Exclude<UserRole, "public">) {
  const user = await getSessionUser();
  if (!user || user.role !== role) return null;
  return user;
}

/** Returns the session user when their role is in `roles`, otherwise null. */
export async function requireAnyRole(roles: Array<Exclude<UserRole, "public">>) {
  const user = await getSessionUser();
  if (!user || !roles.includes(user.role as Exclude<UserRole, "public">)) return null;
  return user;
}
