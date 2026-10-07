import { getEventEditorTranslator } from "./event-editor-translations";
type DraftStatusProps = {
  locale?: "id" | "en";
  state: "saved" | "unsaved" | "saving" | "conflict" | "locked" | "not_editable" | "error";
};

export function DraftStatus({ locale = "en", state }: DraftStatusProps) {
  const t = getEventEditorTranslator(locale);
  return <p aria-live="polite" className="text-right text-sm font-semibold text-[var(--color-text-subtle)]" role="status">
    {t(`status_${state}`)}
  </p>;
}
