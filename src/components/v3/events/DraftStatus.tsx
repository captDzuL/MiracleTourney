type DraftStatusProps = {
  state: "saved" | "unsaved" | "saving" | "conflict" | "not_editable" | "error";
};

const statusLabels = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving...",
  conflict: "Save conflict. Reload before continuing.",
  not_editable: "This event is no longer a draft.",
  error: "Save failed. Retry when your connection is available.",
} as const;

export function DraftStatus({ state }: DraftStatusProps) {
  return <p aria-live="polite" className="text-sm font-semibold text-[var(--color-text-subtle)]" role="status">
    {statusLabels[state]}
  </p>;
}