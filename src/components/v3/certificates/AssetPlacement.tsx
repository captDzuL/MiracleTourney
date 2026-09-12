import type { CertificateAssetKind, CertificateAssetPlacement } from "@/lib/certificate/service";
import { useRouter } from "next/navigation";
import { uploadCertificateAssetAction } from "@/lib/actions/certificate-v3-actions";
import { MIRACLE_V3_SAFE_ZONES } from "@/lib/certificate/templates/miracle-v3-contract";

export type ApprovedCertificateAsset = {
  readonly id: string;
  readonly label: string;
  readonly purpose: "certificate_team_logo" | "certificate_character_art";
};

type Props = {
  assetId: string;
  approvedAssets: readonly ApprovedCertificateAsset[];
  allowedKinds: readonly CertificateAssetKind[];
  disabled: boolean;
  error: string | null;
  errorId?: string;
  eventId: string;
  placement: CertificateAssetPlacement;
  onAssetIdChange(value: string): void;
  onPlacementChange(value: CertificateAssetPlacement): void;
  labels: {
    title: string; assetId: string; assetHelp: string; kind: string; x: string; y: string; width: string; height: string;
    safeZone: string; none: string; upload: string; uploadLabel: string;
    roles: Record<CertificateAssetKind, string>;
  };
};

export function AssetPlacement({
  assetId, approvedAssets, allowedKinds, disabled, error, errorId = "certificate-placement-error", eventId,
  placement, onAssetIdChange, onPlacementChange, labels,
}: Props) {
  const zone = placement.assetKind === "team_logo_badge" ? MIRACLE_V3_SAFE_ZONES.secondaryBadge : MIRACLE_V3_SAFE_ZONES.hero;
  const router = useRouter();
  const purpose = placement.assetKind === "character_art" ? "certificate_character_art" : "certificate_team_logo";
  const choices = approvedAssets.filter((asset) => asset.purpose === purpose);
  const numberField = (key: "x" | "y" | "width" | "height", label: string) => <label className="grid gap-1 text-xs font-bold text-[var(--color-text-muted)]">{label}<input aria-describedby={error ? errorId : undefined} aria-invalid={error ? "true" : undefined} className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 text-sm miracle-focus-ring" disabled={disabled} inputMode="decimal" min={0} name={key} onChange={(event) => onPlacementChange({ ...placement, [key]: Number(event.target.value) })} step={1} type="number" value={placement[key]} /></label>;
  return <section aria-labelledby={`${errorId}-title`} className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
    <h2 className="text-base font-extrabold" id={`${errorId}-title`}>{labels.title}</h2>
    <label className="mt-4 block text-xs font-bold text-[var(--color-text-muted)]" htmlFor={`${errorId}-asset`}>{labels.assetId}</label>
    <select aria-describedby={`${errorId}-help`} className="mt-2 min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 text-sm miracle-focus-ring" disabled={disabled} id={`${errorId}-asset`} name="assetId" onChange={(event) => onAssetIdChange(event.target.value)} value={assetId}>
      <option value="">{labels.none}</option>
      {choices.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
    </select>
    <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]" id={`${errorId}-help`}>{labels.assetHelp}</p>
    <label className="mt-4 grid gap-1 text-xs font-bold text-[var(--color-text-muted)]">{labels.kind}<select className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 text-sm miracle-focus-ring" disabled={disabled || allowedKinds.length === 1} onChange={(event) => onPlacementChange({ ...placement, assetKind: event.target.value as CertificateAssetKind })} value={placement.assetKind}>{allowedKinds.map((kind) => <option key={kind} value={kind}>{labels.roles[kind]}</option>)}</select></label>
    <div className="mt-4 grid min-w-0 grid-cols-2 gap-3">{numberField("x", labels.x)}{numberField("y", labels.y)}{numberField("width", labels.width)}{numberField("height", labels.height)}</div>
    {error ? <p className="mt-3 text-xs font-bold text-red-300" id={errorId}>{error}</p> : null}
    <div aria-label={`${labels.safeZone}: ${zone.x}, ${zone.y}, ${zone.width} × ${zone.height}`} className="mt-4 aspect-[9/16] w-full max-w-44 rounded border border-dashed border-[var(--color-brand-cyan)] bg-[var(--color-surface-subtle)]" data-editor-safe-zone role="img" />
    <form action={async (formData) => { const result = await uploadCertificateAssetAction(formData); if (result.status === "uploaded") router.refresh(); }} className="mt-4 grid gap-2">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="purpose" type="hidden" value={purpose} />
      <label className="text-xs font-bold text-[var(--color-text-muted)]">{labels.uploadLabel}<input accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-xs" disabled={disabled} name="asset" required type="file" /></label>
      <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 text-sm font-bold miracle-focus-ring" disabled={disabled} type="submit">{labels.upload}</button>
    </form>
  </section>;
}
