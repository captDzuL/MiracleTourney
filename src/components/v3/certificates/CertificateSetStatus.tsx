import type { CertificateStudioRecord } from "@/lib/certificate/service";
type Row = { certificateType: CertificateStudioRecord["certificateType"]; selectedCertificateId: string | null; versions: readonly (CertificateStudioRecord & { lastError: string | null })[] | null };
export function CertificateSetStatus({ records, labels }: { records: readonly Row[]; labels: { title: string; ready: string; incomplete: string; published: string; notPublished: string } }) {
  const selected = records.flatMap((group) => group.versions?.find((row) => row.id === group.selectedCertificateId) ?? []);
  const ready = selected.filter((row) => row.status === "ready" || row.status === "published").length;
  const published = selected.filter((row) => row.status === "published").length;
  return <section aria-labelledby="certificate-set-title" className="rounded-[var(--radius-panel)] border border-[var(--color-brand-cream)]/40 bg-[var(--color-surface)] p-5"><h2 className="text-base font-extrabold" id="certificate-set-title">{labels.title}</h2><p className="mt-3 text-2xl font-extrabold text-[var(--color-accent-cyan-foreground)]">{ready} / 7 {labels.ready}</p><p className="mt-2 text-xs font-bold text-[var(--color-text-muted)]">{ready === 7 ? labels.ready : labels.incomplete}</p><p className="mt-4 text-sm">{published === 7 ? labels.published : labels.notPublished}</p></section>;
}
