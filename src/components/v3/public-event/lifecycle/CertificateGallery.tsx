import React from "react";
import type { PublicV3Certificate, PublicV3Locale } from "@/lib/events/public-v3-types";
import { publicV3LocalizedHref } from "@/lib/events/public-v3-types";
import { certificateTypeLabel } from "@/lib/certificate/type-labels";

const copy = {
  id: { fullSize: "Lihat ukuran penuh", verify: "Verifikasi", alt: (type: string, name: string) => `Certificate ${type} untuk ${name}` },
  en: { fullSize: "View full size", verify: "Verify", alt: (type: string, name: string) => `${type} certificate for ${name}` },
} as const;

/** Certificates are 1080x1920 portrait images, shown inline in a swipeable row. */
export function CertificateGallery({ items, locale }: { items: PublicV3Certificate[]; locale: PublicV3Locale }) {
  const t = copy[locale];
  return <ul className="mt-4 grid snap-x snap-mandatory auto-cols-[72%] grid-flow-col gap-4 overflow-x-auto overscroll-x-contain pb-3 sm:auto-cols-[34%]" data-certificate-gallery>
    {items.map((certificate) => {
      const typeLabel = certificateTypeLabel(locale, certificate.type);
      return <li key={certificate.id} className="min-w-0 snap-start" data-certificate-type={certificate.type}>
        <a className="block border border-[var(--mpv3-border)] bg-[var(--mpv3-inset)]" href={certificate.publishedUrl} target="_blank" rel="noopener noreferrer" aria-hidden="true" tabIndex={-1}>
          <img className="block aspect-[9/16] h-auto w-full object-cover" src={certificate.publishedUrl} alt={t.alt(typeLabel, certificate.recipientName)} width={1080} height={1920} loading="lazy" decoding="async" />
        </a>
        <p className="mpv3-eyebrow mt-3">{typeLabel}</p>
        <p className="mt-1 break-words font-semibold">{certificate.recipientName}</p>
        <span className="mt-2 flex flex-wrap gap-3">
          <a className="mpv3-action mpv3-action--text" href={certificate.publishedUrl} target="_blank" rel="noopener noreferrer">{t.fullSize}</a>
          <a className="mpv3-action mpv3-action--text" href={publicV3LocalizedHref(`/certificates/verify/${encodeURIComponent(certificate.verificationCode)}`)[locale]}>{t.verify}</a>
        </span>
      </li>;
    })}
  </ul>;
}
