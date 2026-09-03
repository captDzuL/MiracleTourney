import { ExternalLink, Radio } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { getTikTokLiveHandle } from "@/lib/streams";
import { TikTokLiveCard } from "@/components/TikTokLiveCard";

export const buttonStyles = {
  primary:
    "inline-flex items-center justify-center rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300",
  secondary:
    "inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2",
};

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("pv-section-card rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(0,102,255,0.08)]", className)}>
      <div className="mb-5">
        <h2 className="pv-section-card__title text-xl font-semibold text-slate-900">{title}</h2>
        {description ? <p className="pv-section-card__desc mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="pv-stat-card rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="pv-stat-card__label mono text-sm text-slate-500">{label}</p>
      <p className="pv-stat-card__value mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="pv-stat-card__hint mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "live" | "success" }) {
  return (
    <span
      className={cn(
        "pv-pill inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        tone === "default" && "pv-pill--default bg-slate-100 text-slate-700",
        tone === "success" && "pv-pill--success bg-emerald-100 text-emerald-700",
        tone === "live" && "pv-pill--live bg-red-100 text-red-600",
      )}
    >
      {tone === "live" ? <Radio className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

export function DataTable({
  columns,
  minTableWidth = "44rem",
  rows,
}: {
  columns: string[];
  minTableWidth?: string;
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <div className="pv-data-table w-full overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full divide-y divide-slate-200 text-left text-sm" style={{ minWidth: minTableWidth }}>
        <thead className="pv-data-table__head bg-slate-50 text-slate-500">
          <tr>
            {columns.map((column, columnIndex) => (
              <th key={columnIndex} className="px-4 py-3 align-top font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={cn("pv-data-table__row", rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/70")}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="px-4 py-3 align-top text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LiveStreamCard({
  label,
  watchUrl,
  embedUrl,
  shouldEmbed,
}: {
  label: string;
  watchUrl: string;
  embedUrl: string | null;
  shouldEmbed: boolean;
}) {
  const tikTokHandle = getTikTokLiveHandle(watchUrl);
  if (tikTokHandle) {
    return <TikTokLiveCard label={label} watchUrl={watchUrl} handle={tikTokHandle} />;
  }

  return (
    <div className="pv-livestream-card overflow-hidden rounded-2xl border border-red-200 bg-white">
      <div className="pv-livestream-card__header flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="pv-livestream-card__label text-sm font-medium text-slate-900">{label}</p>
          <p className="pv-livestream-card__hint text-xs text-slate-500">Live coverage attached at event level</p>
        </div>
        <a
          href={watchUrl}
          target="_blank"
          rel="noreferrer"
          className="pv-livestream-card__link inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
        >
          Watch source
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      {shouldEmbed && embedUrl ? (
        <iframe
          src={embedUrl}
          title={label}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="pv-livestream-card__fallback flex aspect-video items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-500">
          External platform stream is linked here to keep the site lightweight and reliable.
        </div>
      )}
    </div>
  );
}
