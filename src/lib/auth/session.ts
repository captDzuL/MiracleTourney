import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

import { getUserWithPasswordByEmail, getCaptainById, getUserByEmail } from "@/lib/platform/repository";
import type { AppUser, UserRole } from "@/lib/platform/types";

const JWT_COOKIE = "mfl_token";
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "miracle-tourney-jwt-secret-change-in-production-32chars-min",
);
const JWT_EXPIRY = "7d";

async function signToken(payload: { sub: string; role: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

async function verifyToken(token: string): Promise<{ sub: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export const getSessionUser = cache(async (): Promise<AppUser | null> => {
  const store = await cookies();
  const token = store.get(JWT_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyToken(token);
  if (!claims) return null;

  return getCaptainById(claims.sub) ?? getUserByEmail(claims.sub) ?? null;
});

export async function signIn(email: string, password: string) {
  const user = await getUserWithPasswordByEmail(email);

  if (!user) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  const token = await signToken({ sub: user.id, role: user.role });
  const store = await cookies();
  store.set(JWT_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });

  const { passwordHash: _, ...publicUser } = user;
  return { ok: true as const, user: publicUser };
}

export async function signOut() {
  const store = await cookies();
  store.delete(JWT_COOKIE);
}

export async function requireRole(role: Exclude<UserRole, "public">) {
  const user = await getSessionUser();
  if (!user || user.role !== role) return null;
  return user;
}
