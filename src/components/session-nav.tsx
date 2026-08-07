"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/lib/actions";

type MeResponse = { user: { name: string; role: string; pendingCount: number } | null };

export function SessionNav() {
  const [data, setData] = useState<MeResponse | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json() as Promise<MeResponse>)
      .then(setData)
      .catch(() => setData({ user: null }));
  }, []);

  if (!data) return <SessionNavSkeleton />;

  const { user } = data;

  return (
    <>
      {user?.role === "captain" && (
        <Link className="rounded-full px-3 py-2 hover:bg-blue-50" href="/captain/stats">
          Match Stats
        </Link>
      )}
      <Link className="relative rounded-full px-3 py-2 hover:bg-blue-50" href="/admin">
        Admin
        {(user?.pendingCount ?? 0) > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {user!.pendingCount}
          </span>
        )}
      </Link>
      {user ? (
        <form action={logoutAction}>
          <button
            aria-label="Keluar"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
            type="submit"
          >
            <LogOut className="h-4 w-4" />
            {user.name}
          </button>
        </form>
      ) : (
        <Link
          className="rounded-full border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
          href="/login"
        >
          Demo Login
        </Link>
      )}
    </>
  );
}

export function SessionNavSkeleton() {
  return (
    <>
      <div className="h-9 w-14 animate-pulse rounded-full bg-slate-100" />
      <div className="h-9 w-28 animate-pulse rounded-full bg-slate-100" />
    </>
  );
}
