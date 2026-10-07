import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { renderEventDetailPage } from "@/app/events/[slug]/event-detail-page";
import { resolveEventRevisionPreviewToken } from "@/lib/events/event-revision";
import { resolveEventPreviewToken } from "@/lib/events/preview-token";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function PreviewEventPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (locale !== "id" && locale !== "en") notFound();
  setRequestLocale(locale);

  const preview = await resolveEventPreviewToken(token) ?? await resolveEventRevisionPreviewToken(token);
  if (!preview) notFound();

  const t = await getTranslations("eventPreview");
  return (
    <>
      <aside
        aria-label={t("bannerTitle")}
        className="sticky top-16 z-30 border-b border-cyan-300 bg-cyan-50 px-4 py-3 text-cyan-950 shadow-sm"
      >
        <div className="mx-auto max-w-[var(--content-width-public)]">
          <p className="text-sm font-bold">{t("bannerTitle")}</p>
          <p className="text-sm">{t("bannerDescription")}</p>
        </div>
      </aside>
      {await renderEventDetailPage(preview.event.slug, locale, preview.event, { readOnly: true })}
    </>
  );
}