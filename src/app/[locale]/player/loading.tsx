import React from "react";

/** A quiet placeholder while the player's registrations load. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      {[0, 1].map((row) => (
        <div key={row} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-5 w-48 animate-pulse rounded-lg bg-slate-200/80" />
          <div className="mt-3 h-3 w-72 max-w-full animate-pulse rounded-lg bg-slate-200/80" />
          <div className="mt-5 h-11 w-40 animate-pulse rounded-lg bg-slate-200/80" />
        </div>
      ))}
    </div>
  );
}
