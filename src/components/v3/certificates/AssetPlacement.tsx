import type { CertificateAssetKind, CertificateAssetPlacement } from "@/lib/certificate/service";
import { MIRACLE_V3_SAFE_ZONES } from "@/lib/certificate/templates/miracle-v3-contract";

type Props = {
  assetId: string; disabled: boolean; placement: CertificateAssetPlacement;
  onAssetIdChange(value: string): void; onPlacementChange(value: CertificateAssetPlacement): void;
  labels: { title: string; assetId: string; assetHelp: string; kind: string; x: string; y: string; width: string; height: string; safeZone: string };
};
const KINDS: readonly CertificateAssetKind[] = ["team_logo_hero", "character_art", "team_logo_badge"];

export function AssetPlacement({ assetId, disabled, placement, onAssetIdChange, onPlacementChange, labels }: Props) {
  const zone = placement.assetKind === "team_logo_badge" ? MIRACLE_V3_SAFE_ZONES.secondaryBadge : MIRACLE_V3_SAFE_ZONES.hero;
  const numberField = (key: "x" | "y" | "width" | "height", label: string) => <label className="grid gap-1 text-xs font-bold text-[var(--color-text-muted)]">{label}<input className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 text-sm miracle-focus-ring" disabled={disabled} inputMode="decimal" min={0} name={key} onChange={(event) => onPlacementChange({ ...placement, [key]: Number(event.target.value) })} step={1} type="number" value={placement[key]} /></label>;
  return <section aria-labelledby="certificate-assets-title" className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
    <h2 className="text-base font-extrabold" id="certificate-assets-title">{labels.title}</h2>
    <label className="mt-4 block text-xs font-bold text-[var(--color-text-muted)]" htmlFor="certificate-asset-id">{labels.assetId}</label>
    <input aria-describedby="certificate-asset-help" className="mt-2 min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 text-sm miracle-focus-ring" disabled={disabled} id="certificate-asset-id" name="assetId" onChange={(event) => onAssetIdChange(event.target.value)} value={assetId} />
    <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]" id="certificate-asset-help">{labels.assetHelp}</p>
    <label className="mt-4 grid gap-1 text-xs font-bold text-[var(--color-text-muted)]">{labels.kind}<select className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] px-3 text-sm miracle-focus-ring" disabled={disabled} onChange={(event) => onPlacementChange({ ...placement, assetKind: event.target.value as CertificateAssetKind })} value={placement.assetKind}>{KINDS.map((kind) => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}</select></label>
    <div className="mt-4 grid min-w-0 grid-cols-2 gap-3">{numberField("x", labels.x)}{numberField("y", labels.y)}{numberField("width", labels.width)}{numberField("height", labels.height)}</div>
    <div aria-label={`${labels.safeZone}: ${zone.x}, ${zone.y}, ${zone.width} × ${zone.height}`} className="mt-4 aspect-[9/16] w-full max-w-44 rounded border border-dashed border-[var(--color-brand-cyan)] bg-[var(--color-surface-subtle)]" data-editor-safe-zone role="img" />
  </section>;
}
