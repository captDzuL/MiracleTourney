"use client";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { FileBadge2, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { publishCertificateSetAction, regenerateCertificateAction } from "@/lib/actions/certificate-v3-actions";
import type { CertificateAssetKind, CertificateAssetPlacement, CertificateStudioRecord, PublishCertificateSetResult, RegenerateCertificateResult } from "@/lib/certificate/service";
import { MIRACLE_V3_CERTIFICATE_TYPES, MIRACLE_V3_SAFE_ZONES, type MiracleV3CertificateType } from "@/lib/certificate/templates/miracle-v3-contract";
import { AssetPlacement, type ApprovedCertificateAsset } from "./AssetPlacement";
import { CertificateSetStatus } from "./CertificateSetStatus";

export type CertificateStudioVersion = CertificateStudioRecord & { readonly lastError: string | null };
export type CertificateStudioTypeState = { readonly certificateType: MiracleV3CertificateType; readonly recipient: { readonly id: string; readonly name: string; readonly kind: "team" | "player" } | null; readonly selectedCertificateId: string | null; readonly versions: readonly CertificateStudioVersion[] | null };
type StudioBase = { readonly event: { readonly id: string; readonly name: string }; readonly records: readonly CertificateStudioTypeState[]; readonly approvedAssets: readonly ApprovedCertificateAsset[] };
export type CertificateStudioState =
  | StudioBase & { readonly status: "integration_required"; readonly completionVersion: null; readonly certificateRevision: null; readonly publication: null }
  | StudioBase & { readonly status: "available"; readonly completionVersion: number; readonly certificateRevision: number; readonly publication: { readonly version: number; readonly publishedAt: string } | null };
type Props = { state: CertificateStudioState; generationKeys: Record<MiracleV3CertificateType, string>; publicationKey: string; regenerateAction?: (input: unknown) => Promise<RegenerateCertificateResult>; publishAction?: (input: unknown) => Promise<PublishCertificateSetResult> };

const DEFAULT_PLACEMENTS: Record<CertificateAssetKind, CertificateAssetPlacement> = {
  team_logo_hero: { assetKind: "team_logo_hero", x: 360, y: 748, width: 560, height: 540 },
  character_art: { assetKind: "character_art", x: 360, y: 708, width: 560, height: 620 },
  team_logo_badge: { assetKind: "team_logo_badge", x: 80, y: 1052, width: 160, height: 160 },
};
const isTeamType = (type: MiracleV3CertificateType) => ["champion", "runner_up", "third_place"].includes(type);
const placementInsideZone = (placement: CertificateAssetPlacement) => {
  const zone = placement.assetKind === "team_logo_badge" ? MIRACLE_V3_SAFE_ZONES.secondaryBadge : MIRACLE_V3_SAFE_ZONES.hero;
  return [placement.x, placement.y, placement.width, placement.height].every(Number.isFinite)
    && placement.width > 0 && placement.height > 0
    && placement.x >= zone.x && placement.y >= zone.y
    && placement.x + placement.width <= zone.x + zone.width
    && placement.y + placement.height <= zone.y + zone.height;
};

export function CertificateStudio({ state, generationKeys, publicationKey, regenerateAction = regenerateCertificateAction, publishAction = publishCertificateSetAction }: Props) {
  const t = useTranslations("certificateStudio");
  const format = useFormatter();
  const router = useRouter();
  const [activeType, setActiveType] = useState<MiracleV3CertificateType>("champion");
  const [selected, setSelected] = useState<Record<string, string | null>>(() => Object.fromEntries(state.records.map((record) => [record.certificateType, record.selectedCertificateId])));
  const [assetIds, setAssetIds] = useState<Record<CertificateAssetKind, string>>({ team_logo_hero: "", character_art: "", team_logo_badge: "" });
  const [placements, setPlacements] = useState<Record<CertificateAssetKind, CertificateAssetPlacement>>(DEFAULT_PLACEMENTS);
  const [currentGenerationKeys, setCurrentGenerationKeys] = useState(generationKeys);
  const [message, setMessage] = useState("");
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [lockedRevision, setLockedRevision] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const unavailable = state.status === "integration_required";
  const authoritativeRevision = unavailable ? "integration-required" : `${state.completionVersion}:${state.certificateRevision}`;
  const locked = lockedRevision === authoritativeRevision;
  useEffect(() => {
    if (lockedRevision && lockedRevision !== authoritativeRevision) setLockedRevision(null);
  }, [authoritativeRevision, lockedRevision]);

  const active = state.records.find((record) => record.certificateType === activeType)!;
  const activeVersion = active.versions?.find((version) => version.id === selected[activeType]) ?? active.versions?.at(-1) ?? null;
  const activeKinds: readonly CertificateAssetKind[] = isTeamType(activeType) ? ["team_logo_hero"] : ["character_art", "team_logo_badge"];
  const chooseType = (type: MiracleV3CertificateType) => { setActiveType(type); setPlacementError(null); };
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % 7;
    if (event.key === "ArrowLeft") next = (index + 6) % 7;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = 6;
    if (next === null) return;
    event.preventDefault(); chooseType(MIRACLE_V3_CERTIFICATE_TYPES[next]); refs.current[next]?.focus();
  };
  const feedback = (result: RegenerateCertificateResult | PublishCertificateSetResult) => {
    if (result.status === "generated") return t("feedback.generated");
    if (result.status === "generation_in_progress") return t("feedback.generation_in_progress");
    if (result.status === "published") return t("feedback.published");
    if (result.status === "already_applied") return t("feedback.alreadyApplied");
    if (result.status === "integration_required") return t("feedback.integrationRequired");
    if (result.status === "failed") return t("feedback.failed");
    if (result.status === "conflict") return t("feedback.conflict");
    return t(`feedback.${result.code}`);
  };
  const regenerate = () => {
    if (unavailable || locked || pending) return;
    const assets = activeKinds.flatMap((kind) => assetIds[kind] ? [{ assetId: assetIds[kind], placement: placements[kind] }] : []);
    if (assets.some((asset) => !placementInsideZone(asset.placement))) { setPlacementError(t("assets.invalidPlacement")); return; }
    setPlacementError(null);
    startTransition(async () => {
      const result = await regenerateAction({ eventId: state.event.id, certificateType: activeType, expectedVersion: state.completionVersion, idempotencyKey: currentGenerationKeys[activeType], ...(assets.length ? { assets } : {}) });
      const terminal = result.status === "already_applied" ? result.result : result;
      setMessage(terminal.status === "failed" ? feedback(terminal) : feedback(result));
      if (terminal.status === "generated" || terminal.status === "failed")
        setCurrentGenerationKeys((current) => ({ ...current, [activeType]: crypto.randomUUID() }));
      if (terminal.status === "failed") {
        router.refresh();
        return;
      }
      if (result.status === "conflict" || result.status === "integration_required" || (result.status === "blocked" && result.code === "completion_required")) {
        setLockedRevision(authoritativeRevision); router.refresh(); return;
      }
      if (result.status === "generated" || result.status === "already_applied" || result.status === "generation_in_progress") router.refresh();
    });
  };
  const selection = unavailable ? [] : state.records.flatMap((record) => selected[record.certificateType] ? [{ certificateType: record.certificateType, certificateId: selected[record.certificateType]! }] : []);
  const chosen = unavailable ? [] : state.records.flatMap((record) => record.versions?.find((version) => version.id === selected[record.certificateType]) ?? []);
  const canPublish = !unavailable && !locked && selection.length === 7 && chosen.length === 7 && chosen.every((row) => row.status === "ready" || row.status === "published");
  const publish = () => {
    if (!canPublish || pending || unavailable) return;
    startTransition(async () => {
      const result = await publishAction({ eventId: state.event.id, expectedVersion: state.completionVersion, expectedCertificateRevision: state.certificateRevision, idempotencyKey: publicationKey, selection });
      setMessage(feedback(result));
      if (result.status === "conflict" || result.status === "integration_required" || (result.status === "blocked" && result.code !== "set_not_ready")) setLockedRevision(authoritativeRevision);
      router.refresh();
    });
  };
  const assetLabels = {
    title: t("assets.title"), assetId: t("assets.assetId"), assetHelp: t("assets.help"), kind: t("assets.kind"),
    x: t("assets.x"), y: t("assets.y"), width: t("assets.width"), height: t("assets.height"), safeZone: t("assets.safeZone"),
    none: t("assets.none"), upload: t("assets.upload"), uploadLabel: t("assets.uploadLabel"), uploaded: t("assets.uploaded"),
    uploadErrors: Object.fromEntries(["invalid_entity_id", "missing_file", "file_too_large", "unsupported_type", "signature_mismatch", "decode_failed", "invalid_dimensions", "upload_failed"]
      .map((code) => [code, t(`assets.uploadErrors.${code}`)])),
    roles: { team_logo_hero: t("assets.roles.team_logo_hero"), character_art: t("assets.roles.character_art"), team_logo_badge: t("assets.roles.team_logo_badge") },
  };

  return <main className="min-w-0 max-w-full overflow-x-clip text-[var(--color-text)]" data-certificate-studio>
    <header className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-accent-cream-foreground)]">{state.event.name}</p><h1 className="mt-2 text-2xl font-extrabold min-[700px]:text-3xl">{t("title")}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">{unavailable ? t("integration.body") : t("description")}</p>{unavailable ? <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-4 text-sm font-bold">{t("integration.title")}</p> : null}</header>
    <nav aria-label={t("types.label")} className="mt-4 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-1"><div className="flex min-w-max gap-1" role="tablist">{MIRACLE_V3_CERTIFICATE_TYPES.map((type, index) => <button aria-controls="certificate-studio-panel" aria-selected={activeType === type} className="min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-bold miracle-focus-ring aria-[selected=true]:bg-[var(--color-surface-selected)] aria-[selected=true]:text-[var(--color-accent-cyan-foreground)]" data-certificate-type={type} id={`certificate-type-${type}`} key={type} onClick={() => chooseType(type)} onKeyDown={(event) => moveTab(event, index)} ref={(node) => { refs.current[index] = node; }} role="tab" tabIndex={activeType === type ? 0 : -1} type="button">{t(`types.${type}`)}</button>)}</div></nav>
    <div className="mt-4 grid min-w-0 gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby={`certificate-type-${activeType}`} className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5" id="certificate-studio-panel" role="tabpanel">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-accent-violet-foreground)]">{t(`types.${activeType}`)}</p><h2 className="mt-2 break-words text-xl font-extrabold">{active.recipient?.name ?? t("recipientPending")}</h2></div><span className="rounded-full border border-[var(--color-border-strong)] px-3 py-2 text-xs font-bold">{activeVersion ? t(`status.${activeVersion.status}`) : t("status.missing")}</span></div>
        <div aria-label={t("versions.label")} className="mt-4 flex min-w-0 flex-wrap gap-2">{active.versions?.map((version) => <button aria-pressed={selected[activeType] === version.id} className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-bold miracle-focus-ring aria-[pressed=true]:bg-[var(--color-brand-violet)] aria-[pressed=true]:text-[var(--color-on-accent)]" data-version={version.version} key={version.id} onClick={() => setSelected((current) => ({ ...current, [activeType]: version.id }))} type="button">{t("versions.version", { version: version.version })}</button>)}</div>
        <div className="mt-5 min-h-64 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)]" data-generated-artifact>{activeVersion?.imageUrl ? <img alt={t("previewAlt", { type: t(`types.${activeType}`), recipient: active.recipient?.name ?? "" })} className="mx-auto block max-h-[42rem] max-w-full object-contain" data-certificate-preview src={activeVersion.imageUrl} /> : <div className="grid min-h-64 place-items-center p-6 text-center text-sm text-[var(--color-text-muted)]">{t("previewMissing")}</div>}</div>
        {activeVersion?.lastError ? <p className="mt-4 rounded-[var(--radius-control)] border border-red-400/50 bg-red-950/20 p-3 text-sm"><strong>{t("lastError")}:</strong> {activeVersion.lastError}</p> : null}
        <div className="mt-5 grid gap-2 text-xs text-[var(--color-text-muted)]">{active.versions?.map((version) => <p className="break-words" key={`history-${version.id}`}>{t("versions.version", { version: version.version })} · {t(`status.${version.status}`)}{version.publishedAt ? ` · ${t("publishedAt", { date: format.dateTime(new Date(version.publishedAt), { day: "numeric", month: "short", year: "numeric" }) })}` : ""}{version.supersededByVersion ? ` · ${t("supersededBy", { version: version.supersededByVersion })}` : ""}</p>)}</div>
      </section>
      <aside className="grid min-w-0 content-start gap-4">
        <CertificateSetStatus labels={{ title: t("set.title"), ready: t("set.ready"), incomplete: t("set.incomplete"), published: t("set.published"), notPublished: t("set.notPublished") }} records={state.records.map((record) => ({ ...record, selectedCertificateId: selected[record.certificateType] ?? null }))} />
        {activeKinds.map((kind, index) => <AssetPlacement approvedAssets={state.approvedAssets} allowedKinds={[kind]} assetId={assetIds[kind]} disabled={unavailable || locked || pending} error={placementError} errorId={index === 0 ? "certificate-placement-error" : `certificate-placement-error-${kind}`} eventId={state.event.id} key={kind} labels={assetLabels} onAssetIdChange={(value) => setAssetIds((current) => ({ ...current, [kind]: value }))} onPlacementChange={(value) => setPlacements((current) => ({ ...current, [kind]: value }))} onUploadMessage={setMessage} placement={placements[kind]} />)}
        <section className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><FileBadge2 aria-hidden="true" className="size-5 text-[var(--color-accent-cyan-foreground)]" /><h2 className="mt-3 text-base font-extrabold">{t("actions.title")}</h2><button className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 text-sm font-extrabold miracle-focus-ring disabled:cursor-not-allowed disabled:bg-[var(--color-surface-selected)]" data-regenerate-certificate disabled={unavailable || locked || pending} onClick={regenerate} type="button"><RefreshCw aria-hidden="true" className="size-4" />{t("actions.regenerate")}</button><button className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-4 text-sm font-extrabold text-[var(--color-on-accent)] miracle-focus-ring disabled:cursor-not-allowed disabled:bg-[var(--color-surface-selected)] disabled:text-[var(--color-text-muted)]" data-publish-certificate-set disabled={!canPublish || pending} onClick={publish} type="button"><ShieldCheck aria-hidden="true" className="size-4" />{t("actions.publish")}</button></section>
      </aside>
    </div>
    <p aria-live="polite" className="sr-only" role="status">{message}</p>
  </main>;
}
