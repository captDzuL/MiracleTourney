import Link from "next/link";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { getPendingStatSubmissionCount } from "@/lib/platform/repository";

export async function SessionNav() {
  const user = await getSessionUser();
  const pendingCount = user?.role === "admin" ? await getPendingStatSubmissionCount() : 0;

  return (
    <>
      {user?.role === "captain" && (
        <Link className="rounded-full px-3 py-2 hover:bg-blue-50" href="/captain/stats">
          Match Stats
        </Link>
      )}
      <Link className="relative rounded-full px-3 py-2 hover:bg-blue-50" href="/admin">
        Admin
        {pendingCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {pendingCount}
          </span>
        )}
      </Link>
      {user ? (
        <form action={logoutAction}>
          <button
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
