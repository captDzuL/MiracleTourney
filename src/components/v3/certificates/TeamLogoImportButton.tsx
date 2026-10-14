import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importTeamLogoAsCertificateAssetAction } from "@/lib/actions/certificate-v3-actions";

export type TeamLogoChoice = {
  readonly teamId: string;
  readonly teamName: string;
  readonly buttonLabel: string;
};

type Props = {
  eventId: string;
  team: TeamLogoChoice;
  disabled: boolean;
  errorId: string;
  importedMessage: string;
  errorMessages: Record<string, string>;
  /** Reads the team of the certificate being edited right now, so a late result for another team is dropped. */
  getActiveTeamId(): string | null;
  onImported(assetId: string, teamId: string): void;
  onMessage(value: string): void;
};

/** Copies the recipient team's existing logo into the event's approved assets and hands back the new asset id. */
export function TeamLogoImportButton({ eventId, team, disabled, errorId, importedMessage, errorMessages, getActiveTeamId, onImported, onMessage }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const importLogo = () => startTransition(async () => {
    let result: Awaited<ReturnType<typeof importTeamLogoAsCertificateAssetAction>> | null = null;
    try { result = await importTeamLogoAsCertificateAssetAction({ eventId, teamId: team.teamId }); }
    catch { result = null; }
    if (result?.status === "imported") {
      if (result.teamId !== getActiveTeamId()) return;
      setError(null); onImported(result.assetId, result.teamId); onMessage(importedMessage); router.refresh(); return;
    }
    const text = (result?.status === "blocked" ? errorMessages[result.code] : undefined) ?? errorMessages.failed;
    setError(text); onMessage(text);
  });
  return <div className="mt-3 grid gap-2">
    <button aria-describedby={error ? errorId : undefined} className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 text-sm font-bold miracle-focus-ring disabled:cursor-not-allowed disabled:bg-[var(--color-surface-selected)]" data-import-team-logo disabled={disabled || pending} onClick={importLogo} type="button">{team.buttonLabel}</button>
    {error ? <p className="text-xs font-bold text-red-300" data-team-logo-error id={errorId}>{error}</p> : null}
  </div>;
}
