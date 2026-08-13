import type React from "react";

import type { Team } from "@/lib/platform/types";

export function TeamAvatar({
  logoText,
  logoUrl,
  name,
  size = "md",
}: Pick<Team, "logoText" | "logoUrl" | "name"> & { size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-7 w-7 rounded-lg text-[10px]" : size === "lg" ? "h-12 w-12 rounded-xl text-sm" : "h-9 w-9 rounded-xl text-xs";
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-slate-100 font-semibold text-slate-600 shadow-sm ${dims}`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="h-full w-full object-cover"
        />
      ) : (
        logoText
      )}
    </span>
  );
}

export function TeamIdentity({
  logoText,
  logoUrl,
  name,
  meta,
  size = "md",
}: Pick<Team, "logoText" | "logoUrl" | "name"> & { meta?: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <TeamAvatar logoText={logoText} logoUrl={logoUrl} name={name} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-slate-900">{name}</span>
        {meta ? <span className="block truncate text-xs text-slate-500">{meta}</span> : null}
      </span>
    </span>
  );
}
