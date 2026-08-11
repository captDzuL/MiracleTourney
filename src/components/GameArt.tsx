import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getGameArtTheme } from "@/lib/platform/config";

const statusClass: Record<string, { class: string; dot?: boolean; key: string }> = {
  Published: { class: "bg-blue-500 text-white", key: "registrationOpen" },
  "Registration Closed": { class: "bg-amber-500 text-white", key: "regClosed" },
  Ongoing: { class: "bg-rose-500 text-white", dot: true, key: "live" },
  Finished: { class: "bg-slate-500 text-white", key: "finished" },
  Draft: { class: "bg-slate-300 text-slate-700", key: "draft" },
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function GameArt({
  gameId,
  logoUrl,
  entityName,
  priority = false,
}: {
  gameId: string;
  logoUrl?: string;
  entityName: string;
  priority?: boolean;
}) {
  const art = getGameArtTheme(gameId);
  const initials = getInitials(entityName) || "EV";
  return (
    <div className="relative h-44 overflow-hidden rounded-t-2xl" style={{ background: art.bg }}>
      <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full" style={{ background: art.orb1 }} />
      <div className="absolute -right-4 bottom-0 h-28 w-28 rounded-full" style={{ background: art.orb2 }} />
      <div className="absolute left-8 top-8 h-20 w-20 rounded-full border" style={{ borderColor: art.ring }} />
      <div className="absolute left-14 top-14 h-10 w-10 rounded-full border" style={{ borderColor: art.ring }} />
      <span className="absolute bottom-2 right-3 select-none text-6xl font-black" style={{ color: "rgba(255,255,255,0.05)", lineHeight: 1 }}>
        {art.label}
      </span>
      <div className="absolute bottom-0 left-4 translate-y-1/2">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={entityName}
            width={56}
            height={56}
            sizes="56px"
            priority={priority}
            className="h-14 w-14 rounded-xl border-2 border-white object-cover shadow-md"
          />
        ) : (
          <div
            className="group relative flex h-14 w-14 items-center justify-center rounded-xl border-2 border-white shadow-md"
            style={{ background: art.bg }}
          >
            <span className="text-sm font-bold text-white">{initials}</span>
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <ImagePlus className="h-4 w-4 text-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export async function StatusBadge({ status }: { status: string }) {
  const t = await getTranslations("status");
  const cfg = statusClass[status] ?? statusClass.Draft;
  const label = t(cfg.key as "registrationOpen" | "regClosed" | "live" | "finished" | "draft");
  return (
    <span
      className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.class}`}
    >
      {cfg.dot && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {label}
    </span>
  );
}
