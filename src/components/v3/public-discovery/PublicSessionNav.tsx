"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, LogOut } from "lucide-react";

import { publicV3LocalizedHref, type PublicV3Locale } from "@/lib/events/public-v3-types";
import { logoutAction } from "@/lib/session-actions";
import { PublicV3Action, PublicV3Button } from "./PublicV3Primitives";

type SessionUser = { name: string; role: string; pendingCount: number };
type SessionState = { status: "loading" } | { status: "ready"; user: SessionUser | null };

const copy = {
  id: { login: "Masuk", logout: "Keluar", captain: "Kapten", player: "Pemain", matchStats: "Statistik Match", organizer: "Organizer", admin: "Admin" },
  en: { login: "Sign in", logout: "Sign out", captain: "Captain", player: "Player", matchStats: "Match stats", organizer: "Organizer", admin: "Admin" },
} as const;

function roleLinks(user: SessionUser, t: (typeof copy)[PublicV3Locale]) {
  if (user.role === "captain") {
    return [{ path: "/captain", label: t.captain }, { path: "/captain/stats", label: t.matchStats }];
  }
  if (user.role === "player") return [{ path: "/player", label: t.player }];
  if (user.role === "organizer") return [{ path: "/organizer", label: t.organizer }];
  if (user.role === "admin" || user.role === "platform_admin") {
    return [{ path: "/admin", label: user.pendingCount > 0 ? `${t.admin} (${user.pendingCount})` : t.admin }];
  }
  return [];
}

/**
 * The public pages draw their own header, so they never pass through the app
 * shell that knows who is signed in. This asks /api/me and shows the links that
 * fit the role. Nothing is drawn until the answer arrives, so a signed-in
 * visitor never sees a "Masuk" button flash by.
 */
export function PublicSessionNav({ locale }: { locale: PublicV3Locale }) {
  const t = copy[locale];
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Session unavailable: ${response.status}`);
        return response.json() as Promise<{ user: SessionUser | null }>;
      })
      .then(({ user }) => {
        if (!controller.signal.aborted) setSession({ status: "ready", user });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSession({ status: "ready", user: null });
      });
    return () => controller.abort();
  }, []);

  if (session.status === "loading") return null;
  const { user } = session;

  if (!user) {
    return <PublicV3Action href={publicV3LocalizedHref("/login")[locale]}>{t.login}<ArrowRight aria-hidden="true" /></PublicV3Action>;
  }

  return <>
    {roleLinks(user, t).map((link) => <PublicV3Action key={link.path} variant="text" href={publicV3LocalizedHref(link.path)[locale]}>{link.label}</PublicV3Action>)}
    <form action={logoutAction}>
      <PublicV3Button type="submit" className="mpv3-session-logout" aria-label={t.logout}>
        <LogOut aria-hidden="true" /><span>{user.name}</span>
      </PublicV3Button>
    </form>
  </>;
}
