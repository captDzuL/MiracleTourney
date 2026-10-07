import { ExternalLink, Info } from "lucide-react";
import { useTranslations } from "next-intl";

function TikTokMark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 0h-4.2v16.4a3.6 3.6 0 1 1-3.1-3.6V8.6a7.8 7.8 0 1 0 7.3 7.8V8.1a10 10 0 0 0 5.9 1.9V5.8A6 6 0 0 1 16.6 0Z" />
    </svg>
  );
}

export function TikTokLiveCard({ label, watchUrl, handle }: {
  label: string;
  watchUrl: string;
  handle: string;
}) {
  const t = useTranslations("tiktokStream");

  return (
    <section aria-label={label} className="overflow-hidden rounded-2xl border border-red-200 bg-white">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold text-slate-900">{label}</h2>
          <p className="mt-0.5 text-xs text-slate-600">{t("subtitle")}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-600">
          <TikTokMark className="h-4 w-4" />
          TikTok LIVE
        </span>
      </header>
      <div className="flex min-h-[390px] items-center justify-center bg-slate-50 px-5 py-9 sm:aspect-video sm:min-h-[400px] sm:px-6 sm:py-10">
        <div className="w-full max-w-[450px] text-center">
          <div className="mx-auto mb-6 flex h-[68px] w-[68px] items-center justify-center rounded-2xl bg-slate-950 text-white sm:h-20 sm:w-20 sm:rounded-[20px]">
            <TikTokMark className="h-9 w-9 sm:h-11 sm:w-11" />
          </div>
          <h3 className="mb-3.5 break-words text-3xl leading-tight font-bold tracking-tight text-slate-900 sm:text-4xl">{handle}</h3>
          <p className="mx-auto mb-6 max-w-[355px] text-[15px] leading-relaxed text-pretty text-slate-600 sm:text-base">{t("description")}</p>
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[50px] w-full items-center justify-center gap-3 rounded-[10px] bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-4 motion-reduce:transition-none sm:w-auto"
          >
            {t("watch")}
            <ExternalLink className="h-5 w-5" aria-hidden="true" />
          </a>
          <p className="mt-3 text-xs text-slate-600">{t("newTab")}</p>
        </div>
      </div>
      <footer className="flex items-start justify-center gap-2 border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-600">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("availability")}</span>
      </footer>
    </section>
  );
}
