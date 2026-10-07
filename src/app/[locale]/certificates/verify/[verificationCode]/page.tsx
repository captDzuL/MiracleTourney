import type { Metadata } from "next";
import { BadgeCheck, History, SearchX, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import React from "react";

import { loadPublishedCertificateVerification } from "@/lib/certificate/verification-repository";
import type { MiracleV3CertificateType } from "@/lib/certificate/templates/miracle-v3-contract";

type Locale = "id" | "en";
type Props = { params: Promise<{ locale: string; verificationCode: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Certificate verification",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const copy = {
  en: {
    eyebrow: "Certificate authenticity",
    title: "Certificate verified",
    current: "Valid · Current version",
    superseded: "Valid · Superseded version",
    currentBody: "This published certificate is authentic and remains valid.",
    supersededBody: (version: number) => `This certificate remains valid. A newer version ${version} has superseded it.`,
    event: "Event",
    type: "Certificate type",
    version: "Certificate version",
    recipient: "Recipient",
    published: "Published",
    code: "Verification code",
    versionValue: (version: number) => `Version ${version}`,
    missingTitle: "Certificate not found",
    missingBody: "This code is invalid, unknown, or has not been published. Check the original certificate and try again.",
  },
  id: {
    eyebrow: "Keaslian sertifikat",
    title: "Sertifikat terverifikasi",
    current: "Valid · Versi terkini",
    superseded: "Valid · Versi terdahulu",
    currentBody: "Sertifikat yang telah dipublikasikan ini asli dan tetap valid.",
    supersededBody: (version: number) => `Sertifikat ini tetap valid. Versi yang lebih baru, versi ${version}, telah menggantikannya.`,
    event: "Event",
    type: "Jenis sertifikat",
    version: "Versi sertifikat",
    recipient: "Penerima",
    published: "Dipublikasikan",
    code: "Kode verifikasi",
    versionValue: (version: number) => `Versi ${version}`,
    missingTitle: "Sertifikat tidak ditemukan",
    missingBody: "Kode ini tidak valid, tidak dikenal, atau sertifikat belum dipublikasikan. Periksa sertifikat asli lalu coba lagi.",
  },
} as const;

const typeLabels: Record<Locale, Record<MiracleV3CertificateType, string>> = {
  en: {
    champion: "Champion",
    runner_up: "Runner-up",
    third_place: "Third Place",
    mvp: "MVP of Tournament",
    top_scorer: "Top Scorer",
    top_defender: "Top Defender",
    top_assist: "Top Assist",
  },
  id: {
    champion: "Juara",
    runner_up: "Runner-up",
    third_place: "Peringkat Ketiga",
    mvp: "MVP Turnamen",
    top_scorer: "Top Scorer",
    top_defender: "Top Defender",
    top_assist: "Top Assist",
  },
};

function formatPublishedAt(value: string, locale: Locale): string {
  return `${new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export default async function CertificateVerificationPage({ params }: Props) {
  const { locale: requestedLocale, verificationCode } = await params;
  if (requestedLocale !== "id" && requestedLocale !== "en") notFound();
  const locale: Locale = requestedLocale;
  setRequestLocale(locale);

  const result = await loadPublishedCertificateVerification(verificationCode);
  const t = copy[locale];

  if (!result) {
    return (
      <main className="mx-auto grid min-h-[60vh] w-full max-w-3xl place-items-center px-4 py-16 text-[var(--color-text)]" data-certificate-verification="not-found">
        <section className="w-full rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-2xl min-[640px]:p-10" aria-labelledby="certificate-verification-title">
          <SearchX aria-hidden="true" className="mx-auto size-12 text-[var(--color-text-muted)]" />
          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-extrabold" id="certificate-verification-title">{t.missingTitle}</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[var(--color-text-muted)]">{t.missingBody}</p>
        </section>
      </main>
    );
  }

  const superseded = result.state === "superseded";
  const statusText = superseded ? t.superseded : t.current;
  const statusBody = superseded
    ? t.supersededBody(result.supersededByVersion!)
    : t.currentBody;

  const facts = [
    [t.event, result.eventName],
    [t.type, typeLabels[locale][result.certificateType]],
    [t.version, t.versionValue(result.certificateVersion)],
    [t.recipient, result.recipientName],
  ] as const;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 text-[var(--color-text)] min-[640px]:py-20" data-certificate-verification={result.state}>
      <article className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl" aria-labelledby="certificate-verification-title">
        <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-6 min-[640px]:p-10">
          <div className="flex size-14 items-center justify-center rounded-full border border-[var(--color-brand-cyan)]/40 bg-[var(--color-brand-cyan)]/10">
            <BadgeCheck aria-hidden="true" className="size-8 text-[var(--color-accent-cyan-foreground)]" />
          </div>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--color-accent-cyan-foreground)]">{t.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-extrabold min-[640px]:text-4xl" id="certificate-verification-title">{t.title}</h1>
          <div className="mt-6 rounded-[var(--radius-control)] border border-[var(--color-brand-cream)]/40 bg-[var(--color-brand-cream)]/10 p-4" role="status">
            <p className="flex items-center gap-2 font-extrabold text-[var(--color-accent-cream-foreground)]">
              {superseded ? <History aria-hidden="true" className="size-5 shrink-0" /> : <ShieldCheck aria-hidden="true" className="size-5 shrink-0" />}
              {statusText}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{statusBody}</p>
          </div>
        </header>

        <dl className="grid gap-px bg-[var(--color-border)] min-[640px]:grid-cols-2">
          {facts.map(([label, value]) => (
            <div className="min-w-0 bg-[var(--color-surface)] p-6" key={label}>
              <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</dt>
              <dd className="mt-2 break-words text-lg font-extrabold">{value}</dd>
            </div>
          ))}
          <div className="min-w-0 bg-[var(--color-surface)] p-6">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t.published}</dt>
            <dd className="mt-2 text-base font-bold">
              <time dateTime={result.publishedAt}>{formatPublishedAt(result.publishedAt, locale)}</time>
            </dd>
          </div>
          <div className="min-w-0 bg-[var(--color-surface)] p-6">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t.code}</dt>
            <dd className="mt-2 break-all font-mono text-sm font-bold">{result.verificationCode}</dd>
          </div>
        </dl>
      </article>
    </main>
  );
}
