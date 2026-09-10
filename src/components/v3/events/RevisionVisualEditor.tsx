import { uploadPublishedRevisionVisualAction } from "@/lib/actions/event-revision-actions";

type RevisionVisualEditorProps = {
  eventId: string;
  locale: "id" | "en";
  logoUrl?: string | null;
  posterUrl?: string | null;
  revisionId: string;
};

const fileClass = "min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]";
const buttonClass = "min-h-11 rounded-[var(--radius-control)] border border-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)]";

export function RevisionVisualEditor({ eventId, locale, logoUrl, posterUrl, revisionId }: RevisionVisualEditorProps) {
  return <div className="grid gap-4 min-[700px]:grid-cols-2" data-revision-visual-editor>
    <form action={uploadPublishedRevisionVisualAction} className="grid content-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-5">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="revisionId" type="hidden" value={revisionId} />
      <input name="locale" type="hidden" value={locale} />
      <input name="kind" type="hidden" value="poster" />
      <div>
        <p className="text-sm font-extrabold text-[var(--color-text)]">Poster revisi</p>
        <p className="mt-1 text-xs leading-5 text-[var(--color-text-subtle)]">Disimpan privat dan baru mengganti poster publik setelah revisi diterapkan.</p>
      </div>
      {posterUrl && <img alt="Poster revisi" className="aspect-[16/6] w-full rounded-[var(--radius-control)] object-cover" src={posterUrl} />}
      <input accept="image/png,image/jpeg,image/webp" className={fileClass} name="revisionPoster" required type="file" />
      <label className="flex items-start gap-3 text-sm text-[var(--color-text)]"><input className="mt-1" name="rightsAttestation" required type="checkbox" value="confirmed" />Saya memiliki izin untuk menerbitkan karya visual ini.</label>
      <button className={buttonClass} type="submit">Unggah poster revisi</button>
    </form>
    <form action={uploadPublishedRevisionVisualAction} className="grid content-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-5">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="revisionId" type="hidden" value={revisionId} />
      <input name="locale" type="hidden" value={locale} />
      <input name="kind" type="hidden" value="logo" />
      <div>
        <p className="text-sm font-extrabold text-[var(--color-text)]">Logo revisi</p>
        <p className="mt-1 text-xs leading-5 text-[var(--color-text-subtle)]">Gunakan gambar persegi. Logo publik lama tetap aktif sampai revisi diterapkan.</p>
      </div>
      {logoUrl && <img alt="Logo revisi" className="size-20 rounded-[var(--radius-control)] object-cover" src={logoUrl} />}
      <input accept="image/png,image/jpeg,image/webp" className={fileClass} name="revisionLogo" required type="file" />
      <button className={buttonClass} type="submit">Unggah logo revisi</button>
    </form>
  </div>;
}
