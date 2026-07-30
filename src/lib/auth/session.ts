import { cookies } from "next/headers";

import { getCaptainById, getUserByEmail } from "@/lib/platform/demo-store";
import type { AppUser, UserRole } from "@/lib/platform/types";

const ROLE_COOKIE = "mfl_role";
const USER_COOKIE = "mfl_user";

export async function getSessionUser(): Promise<AppUser | null> {
  const store = await cookies();
  const role = store.get(ROLE_COOKIE)?.value as UserRole | undefined;
  const userId = store.get(USER_COOKIE)?.value;

  if (!role || role === "public" || !userId) {
    return null;
  }

  return getCaptainById(userId) ?? getUserByEmail(userId) ?? null;
}

export async function signInDemo(email: string) {
  const user = getUserByEmail(email);

  if (!user) {
    return { ok: false as const, error: "Unknown demo account." };
  }

  const store = await cookies();
  store.set(ROLE_COOKIE, user.role, { httpOnly: true, path: "/" });
  store.set(USER_COOKIE, user.id, { httpOnly: true, path: "/" });

  return { ok: true as const, user };
}

export async function signOutDemo() {
  const store = await cookies();
  store.delete(ROLE_COOKIE);
  store.delete(USER_COOKIE);
}

export async function requireRole(role: Exclude<UserRole, "public">) {
  const user = await getSessionUser();

  if (!user || user.role !== role) {
    return null;
  }

  return user;
}
