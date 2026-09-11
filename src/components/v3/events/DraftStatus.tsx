type DraftStatusProps = {
  locale?: "id" | "en";
  state: "saved" | "unsaved" | "saving" | "conflict" | "locked" | "not_editable" | "error";
};

const statusLabels = {
  en: {
    saved: "Saved",
    unsaved: "Unsaved changes",
    saving: "Saving...",
    conflict: "Save conflict. Reload before continuing.",
    locked: "One or more fields are locked for this event state.",
    not_editable: "This event is no longer a draft.",
    error: "Save failed. Retry when your connection is available.",
  },
  id: {
    saved: "Tersimpan",
    unsaved: "Perubahan belum tersimpan",
    saving: "Menyimpan...",
    conflict: "Terjadi konflik penyimpanan. Muat ulang sebelum melanjutkan.",
    locked: "Satu atau beberapa informasi terkunci untuk status event ini.",
    not_editable: "Event ini sudah diterbitkan. Perubahan Draft tidak lagi disimpan.",
    error: "Gagal menyimpan. Coba lagi saat koneksi tersedia.",
  },
} as const;

export function DraftStatus({ locale = "en", state }: DraftStatusProps) {
  return <p aria-live="polite" className="text-right text-sm font-semibold text-[var(--color-text-subtle)]" role="status">
    {statusLabels[locale][state]}
  </p>;
}
