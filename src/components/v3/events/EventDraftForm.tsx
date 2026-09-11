"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { organizerUploadEventLogoAction, organizerUploadEventVisualAction } from "@/lib/actions";
import { saveEventDraftAction } from "@/lib/actions/event-v3-actions";
import { eventDateToLocalInput, eventLocalInputToIso } from "@/lib/events/event-datetime";
import { tournamentFormatConfigSchema, type TournamentFormatConfig } from "@/lib/tournament/formats/types";
import { DraftStatus } from "./DraftStatus";
import { FormatConfigurator } from "./FormatConfigurator";

export type DraftPatch = {
  name?: string;
  gameModeId?: string;
  slug?: string;
  description?: string;
  formatConfig?: TournamentFormatConfig;
  participantCap?: number;
  prizePoolLabel?: string | null;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  eventStartsAt?: string | null;
  timezone?: string;
  venue?: string;
  venueAddress?: string | null;
  registrationFeeRequired?: boolean;
  registrationFeeAmount?: number | null;
  logoUrl?: string | null;
  gameImageUrl?: string | null;
};

type SaveDraft = (input: {
  eventId: string;
  expectedRevision: number;
  mutationId: string;
  draft: DraftPatch;
}) => Promise<{ status: "saved" | "conflict" | "locked" | "not_editable"; revision: number; fields: object; retry?: true }>;

type DraftStatusState = "saved" | "unsaved" | "saving" | "conflict" | "locked" | "not_editable" | "error";
type SaveAttempt = { expectedRevision: number; mutationId: string; patch: DraftPatch };
type DraftJournal = {
  revision: number;
  mutationId?: string;
  patch: DraftPatch;
  retryAttempt?: SaveAttempt;
  queuedAfterAttempt?: boolean;
};

function journalKey(namespace: string, targetId: string) {
  return `miracle:${namespace}:${targetId}`;
}

function readJournal(namespace: string, targetId: string, revision: number): DraftJournal | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(journalKey(namespace, targetId)) ?? "null") as Partial<DraftJournal> | null;
    if (!parsed || typeof parsed.revision !== "number" || !parsed.patch || typeof parsed.patch !== "object") return null;
    const retryAttempt = parsed.retryAttempt;
    const hasRestorableAttempt = retryAttempt
      && retryAttempt.expectedRevision === parsed.revision
      && typeof retryAttempt.mutationId === "string"
      && retryAttempt.patch && typeof retryAttempt.patch === "object"
      && revision >= parsed.revision;
    if (parsed.revision !== revision && !hasRestorableAttempt) return null;
    const patch: DraftPatch = {};
    if (typeof parsed.patch.name === "string") patch.name = parsed.patch.name;
    if (typeof parsed.patch.gameModeId === "string") patch.gameModeId = parsed.patch.gameModeId;
    if (typeof parsed.patch.slug === "string") patch.slug = parsed.patch.slug;
    if (typeof parsed.patch.description === "string") patch.description = parsed.patch.description;
    for (const field of ["registrationOpensAt", "registrationClosesAt", "eventStartsAt", "venueAddress", "logoUrl", "gameImageUrl", "prizePoolLabel"] as const) {
      const value = parsed.patch[field];
      if (typeof value === "string" || value === null) patch[field] = value;
    }
    if (typeof parsed.patch.timezone === "string") patch.timezone = parsed.patch.timezone;
    if (typeof parsed.patch.venue === "string") patch.venue = parsed.patch.venue;
    if (typeof parsed.patch.registrationFeeRequired === "boolean") patch.registrationFeeRequired = parsed.patch.registrationFeeRequired;
    if (typeof parsed.patch.registrationFeeAmount === "number" || parsed.patch.registrationFeeAmount === null) patch.registrationFeeAmount = parsed.patch.registrationFeeAmount;
    const formatConfig = tournamentFormatConfigSchema.safeParse(parsed.patch.formatConfig);
    if (formatConfig.success) patch.formatConfig = formatConfig.data;
    const restoredAttempt = hasRestorableAttempt ? { ...retryAttempt, patch: retryAttempt.patch as DraftPatch } : undefined;
    return Object.keys(patch).length
      ? {
          revision: parsed.revision,
          mutationId: typeof parsed.mutationId === "string" ? parsed.mutationId : undefined,
          patch: restoredAttempt && !parsed.queuedAfterAttempt ? restoredAttempt.patch : patch,
          retryAttempt: restoredAttempt,
          queuedAfterAttempt: Boolean(parsed.queuedAfterAttempt),
        }
      : null;
  } catch {
    return null;
  }
}

function displayPatch(patch: DraftPatch | null, fallbackTimezone: string) {
  if (!patch) return null;
  const displayed = { ...patch };
  const timezone = patch.timezone ?? fallbackTimezone;
  for (const field of ["registrationOpensAt", "registrationClosesAt", "eventStartsAt"] as const) {
    const value = patch[field];
    if (value) displayed[field] = eventDateToLocalInput(new Date(value), timezone);
  }
  return displayed;
}

type LivePreviewDraft = Omit<DraftPatch, "formatConfig"> & { formatConfig: TournamentFormatConfig | null };

function LiveDraftPreview({ draft, editorLabel = "Draft pribadi" }: { draft: LivePreviewDraft; editorLabel?: string }) {
  const capacity = draft.participantCap ?? 16;
  const config = draft.formatConfig;
  const formatLabel = config?.kind === "double_elimination" ? "Double Elimination"
    : config?.kind === "round_robin" ? "Round Robin"
      : config?.kind === "group_playoffs" ? "Group + Playoffs" : "Single Elimination";
  const matchCount = config?.kind === "round_robin" ? capacity * (capacity - 1) / 2
    : config?.kind === "group_playoffs" ? Math.max(0, capacity - config.groupCount) + (config.groupCount * config.qualifiersPerGroup) - 1
      : config?.kind === "double_elimination" ? capacity * 2 - 2
        : capacity - 1 + (config?.kind === "single_elimination" && config.thirdPlace === "required" ? 1 : 0);
  const thirdPlaceEnabled = config?.kind === "single_elimination" && config.thirdPlace === "required";
  const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Belum diatur";
  return <aside aria-label="Live public preview" className="h-fit rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] p-5 min-[1100px]:sticky min-[1100px]:top-6" data-live-preview>
    <div className="flex items-center justify-between gap-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]"><span>Live preview</span><span>{editorLabel}</span></div>
    <div className="mt-5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="grid size-9 overflow-hidden rounded-lg bg-[var(--color-brand-violet)] font-extrabold text-white">{draft.logoUrl ? <img alt="Logo event" className="size-full object-cover" src={draft.logoUrl} /> : <span className="grid size-full place-items-center">M</span>}</div>
      {draft.gameImageUrl && <img alt="Poster event" className="mt-4 aspect-[16/6] w-full rounded-[var(--radius-control)] object-cover" src={draft.gameImageUrl} />}<h3 className="mt-4 break-words text-xl font-extrabold text-[var(--color-text)]">{draft.name || "Nama event kamu"}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-[var(--color-text-subtle)]">{draft.description || "Deskripsi event akan tampil untuk calon peserta dan pengunjung."}</p>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-border)] text-sm"><div className="bg-[var(--color-surface-subtle)] p-3"><dt className="text-xs text-[var(--color-text-subtle)]">Format</dt><dd className="mt-1 font-bold text-[var(--color-text)]">{formatLabel}</dd></div><div className="bg-[var(--color-surface-subtle)] p-3"><dt className="text-xs text-[var(--color-text-subtle)]">Kapasitas</dt><dd className="mt-1 font-bold text-[var(--color-text)]">{capacity} tim</dd></div></dl>
      <p className="mt-4 text-sm font-bold text-[var(--color-text)]">{matchCount} pertandingan terencana{thirdPlaceEnabled ? " · perebutan juara 3 termasuk" : ""}</p>
      <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3" data-preview-prize>
        <p className="text-xs text-[var(--color-text-subtle)]">Hadiah</p>
        <p className="mt-1 break-words text-sm font-bold text-[var(--color-text)]">{draft.prizePoolLabel || "Informasi hadiah belum diisi"}</p>
      </div>
      <dl className="mt-4 grid gap-px overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-border)] text-xs"><div className="bg-[var(--color-surface-subtle)] p-3"><dt className="text-[var(--color-text-subtle)]">Mulai event</dt><dd className="mt-1 font-bold text-[var(--color-text)]">{dateLabel(draft.eventStartsAt)}</dd></div><div className="bg-[var(--color-surface-subtle)] p-3"><dt className="text-[var(--color-text-subtle)]">Lokasi</dt><dd className="mt-1 font-bold text-[var(--color-text)]">{draft.venue || "Belum diatur"}</dd></div><div className="bg-[var(--color-surface-subtle)] p-3"><dt className="text-[var(--color-text-subtle)]">Pendaftaran</dt><dd className="mt-1 font-bold text-[var(--color-text)]">{dateLabel(draft.registrationOpensAt)} — {dateLabel(draft.registrationClosesAt)}</dd></div><div className="bg-[var(--color-surface-subtle)] p-3"><dt className="text-[var(--color-text-subtle)]">Biaya</dt><dd className="mt-1 font-bold text-[var(--color-text)]">{draft.registrationFeeRequired ? (draft.registrationFeeAmount != null ? `Rp${draft.registrationFeeAmount.toLocaleString("id-ID")}` : "Belum diatur") : "Gratis"}</dd></div></dl>
    </div>
    <p className="mt-3 text-xs leading-5 text-[var(--color-text-subtle)]">Ini adalah struktur halaman publik yang akan dilihat pengunjung. Preview diperbarui langsung saat kamu mengisi Draft.</p>
  </aside>;
}
type EventDraftFormProps = {
  eventId: string;
  editable?: boolean;
  locale?: "id" | "en";
  initialDraft: Omit<DraftPatch, "name" | "formatConfig"> & {
    name: string;
    formatConfig: TournamentFormatConfig | null;
  };
  initialRevision: number;
  competitionOperationsEnabled?: boolean;
  saveDraft?: SaveDraft;
  saveTargetId?: string;
  journalNamespace?: string;
  fieldLocks?: Partial<Record<keyof DraftPatch, string>>;
  gameModes?: Array<{ id: string; label: string }>;
  editorLabel?: string;
  visualEditor?: ReactNode;
  registrationPanel?: ReactNode;
  reviewPanel?: ReactNode;
};

export function EventDraftForm({
  eventId,
  editable = true,
  locale = "en",
  initialDraft,
  initialRevision,
  competitionOperationsEnabled = true,
  saveDraft = saveEventDraftAction,
  saveTargetId = eventId,
  journalNamespace = "event-draft",
  fieldLocks = {},
  gameModes = [],
  editorLabel = "Draft pribadi",
  visualEditor,
  registrationPanel,
  reviewPanel,
}: EventDraftFormProps) {
  const router = useRouter();
  const [recoveredJournal] = useState(() => editable ? readJournal(journalNamespace, saveTargetId, initialRevision) : null);
  const recoveredPatch = recoveredJournal?.patch ?? null;
  const [draft, setDraft] = useState(() => ({
    ...initialDraft,
    ...displayPatch(recoveredPatch, initialDraft.timezone ?? "Asia/Jakarta"),
  }));
  const [pendingPatch, setPendingPatch] = useState<DraftPatch | null>(recoveredPatch);
  const [revision, setRevision] = useState(initialRevision);
  const [status, setStatus] = useState<DraftStatusState>(recoveredPatch ? "unsaved" : "saved");
  const [saveCycle, setSaveCycle] = useState(0);
  const pendingPatchRef = useRef<DraftPatch | null>(recoveredPatch);
  const pendingMutationIdRef = useRef(recoveredJournal?.mutationId ?? (recoveredPatch ? crypto.randomUUID() : null));
  const saveInFlight = useRef(false);
  const activeAttemptRef = useRef<SaveAttempt | null>(null);
  const retryAttemptRef = useRef<SaveAttempt | null>(recoveredJournal?.retryAttempt ?? null);
  const stepIds = ["identity", "format", "registration", "public", "review"] as const;
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const syncStepFromHash = () => {
      const step = stepIds.indexOf(window.location.hash.replace("#section-", "") as typeof stepIds[number]);
      if (step >= 0) setActiveStep(step);
    };
    syncStepFromHash();
    window.addEventListener("hashchange", syncStepFromHash);
    return () => window.removeEventListener("hashchange", syncStepFromHash);
  }, []);

  function moveToStep(nextStep: number) {
    const clamped = Math.max(0, Math.min(stepIds.length - 1, nextStep));
    setActiveStep(clamped);
    window.history.replaceState(null, "", `#section-${stepIds[clamped]}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  useEffect(() => {
    if (!editable || (!pendingPatch && !retryAttemptRef.current) || saveInFlight.current) return;
    const timeout = window.setTimeout(async () => {
      const attempt = retryAttemptRef.current ?? {
        expectedRevision: revision,
        mutationId: pendingMutationIdRef.current ?? crypto.randomUUID(),
        patch: pendingPatch!,
      };
      if (!retryAttemptRef.current) pendingMutationIdRef.current = attempt.mutationId;
      activeAttemptRef.current = attempt;
      saveInFlight.current = true;
      setStatus("saving");
      let saved = false;
      try {
        const result = await saveDraft({
          eventId: saveTargetId,
          expectedRevision: attempt.expectedRevision,
          mutationId: attempt.mutationId,
          draft: attempt.patch,
        });
        if (result.status === "saved") {
          saved = true;
          if (retryAttemptRef.current === attempt) retryAttemptRef.current = null;
          setRevision(result.revision);
          if (pendingPatchRef.current === attempt.patch) {
            pendingPatchRef.current = null;
            pendingMutationIdRef.current = null;
            setPendingPatch(null);
            localStorage.removeItem(journalKey(journalNamespace, saveTargetId));
            setStatus("saved");
          } else {
            const queuedPatch = pendingPatchRef.current;
            if (queuedPatch) localStorage.setItem(journalKey(journalNamespace, saveTargetId), JSON.stringify({
              revision: result.revision,
              mutationId: pendingMutationIdRef.current ?? undefined,
              patch: queuedPatch,
            } satisfies DraftJournal));
            setStatus("unsaved");
          }
          router.refresh();
        } else {
          setStatus(result.status);
        }
      } catch {
        retryAttemptRef.current = attempt;
        const queuedPatch = pendingPatchRef.current;
        if (queuedPatch) localStorage.setItem(journalKey(journalNamespace, saveTargetId), JSON.stringify({
          revision: attempt.expectedRevision,
          mutationId: pendingMutationIdRef.current ?? undefined,
          patch: queuedPatch,
          retryAttempt: attempt,
          queuedAfterAttempt: queuedPatch !== attempt.patch,
        } satisfies DraftJournal));
        setStatus("error");
      } finally {
        activeAttemptRef.current = null;
        saveInFlight.current = false;
      }
      if (saved && pendingPatchRef.current !== attempt.patch) setSaveCycle((cycle) => cycle + 1);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [eventId, journalNamespace, pendingPatch, revision, router, saveCycle, saveDraft, saveTargetId]);

  function updateDraft(patch: DraftPatch) {
    setDraft((current) => ({ ...current, ...patch }));
    queuePatch(patch);
  }

  function queuePatch(patch: DraftPatch) {
    setPendingPatch((current) => {
      const nextPatch = { ...current, ...patch };
      pendingMutationIdRef.current = crypto.randomUUID();
      pendingPatchRef.current = nextPatch;
      localStorage.setItem(journalKey(journalNamespace, saveTargetId), JSON.stringify({
        revision,
        mutationId: pendingMutationIdRef.current,
        patch: nextPatch,
        retryAttempt: activeAttemptRef.current ?? retryAttemptRef.current ?? undefined,
        queuedAfterAttempt: Boolean(activeAttemptRef.current || retryAttemptRef.current),
      } satisfies DraftJournal));
      return nextPatch;
    });
    setStatus("unsaved");
  }

  function updateDateDraft(field: "registrationOpensAt" | "registrationClosesAt" | "eventStartsAt", value: string) {
    setDraft((current) => ({ ...current, [field]: value || null }));
    queuePatch({ [field]: eventLocalInputToIso(value, draft.timezone ?? "Asia/Jakarta") });
  }

  function updateTimezone(timezone: string) {
    const patch: DraftPatch = { timezone };
    for (const field of ["registrationOpensAt", "registrationClosesAt", "eventStartsAt"] as const) {
      const value = draft[field];
      if (value) patch[field] = eventLocalInputToIso(value, timezone);
    }
    setDraft((current) => ({ ...current, timezone }));
    queuePatch(patch);
  }
  const inputClass = "h-11 min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-0 leading-5 text-[var(--color-text)]";
  const labelClass = "grid gap-1.5 text-sm font-bold leading-5 text-[var(--color-text)]";
  const lockCopy: Record<string, string> = { event_started: "Event sudah dimulai; informasi ini tidak dapat diubah.", event_finished: "Event sudah selesai; informasi ini tidak dapat diubah.", registration_closed: "Pendaftaran sudah ditutup; periode dan biaya tidak dapat diubah.", matches_exist: "Pertandingan sudah dibuat; struktur kompetisi tidak dapat diubah.", slug_published: "URL publik tidak dapat diubah organizer setelah event diterbitkan." };
  const lockedReason = (field: keyof DraftPatch) => fieldLocks[field] ? (lockCopy[fieldLocks[field]!] ?? fieldLocks[field]!) : null;
  const LockNote = ({ field }: { field: keyof DraftPatch }) => lockedReason(field) ? <span className="text-xs font-semibold text-[var(--color-brand-cream)]" data-field-lock={field}>{lockedReason(field)}</span> : null;

  if (!editable) return <section className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_19rem]" data-event-read-only>
    <div className="rounded-[var(--radius-control)] border border-[var(--color-brand-cream)] bg-[var(--color-surface-subtle)] p-4">
      <p className="text-sm font-extrabold text-[var(--color-brand-cream)]">{locale === "id" ? "Event sudah diterbitkan" : "Event already published"}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{locale === "id" ? "Editor Draft telah dikunci. Informasi di samping adalah tampilan baca-saja dari event yang sudah tersimpan." : "The Draft editor is locked. The preview shows the event information currently stored."}</p>
    </div>
    <LiveDraftPreview draft={draft} editorLabel={editorLabel} />
  </section>;
  return <section aria-labelledby="event-details-heading">
    <div className="grid items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_19rem]"><div className="grid min-w-0 content-start gap-6">
      <div className="flex min-h-8 items-center justify-end gap-3" data-draft-save-status>
        <DraftStatus locale={locale} state={status} />
        {status === "error" && <button
          className="text-sm font-bold text-[var(--color-brand-cyan)]"
          data-retry-save
          onClick={() => {
            setStatus("unsaved");
            setSaveCycle((cycle) => cycle + 1);
          }}
          type="button"
        >{locale === "id" ? "Coba lagi" : "Retry"}</button>}
      </div>
    <section className={activeStep === 0 ? "grid content-start scroll-mt-24 gap-4" : "hidden"} id="section-identity" tabIndex={-1}>
      <div><h3 className="text-xl font-extrabold text-[var(--color-text)]">Kenalkan event-mu.</h3><p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">Mulai dari informasi yang akan dilihat calon peserta. Semua isian bisa kamu ubah lagi.</p></div>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <label className={labelClass}>Nama event<input className={inputClass} disabled={Boolean(lockedReason("name"))} name="name" onChange={(event) => updateDraft({ name: event.target.value })} value={draft.name} /><LockNote field="name" /></label>
        <label className={labelClass}>URL publik<input className={inputClass} disabled={Boolean(lockedReason("slug"))} name="slug" onChange={(event) => updateDraft({ slug: event.target.value })} value={draft.slug ?? ""} /><LockNote field="slug" /></label>
      </div>
      {gameModes.length > 0 && <label className={labelClass}>Game & mode<select className={inputClass} disabled={Boolean(lockedReason("gameModeId"))} name="gameModeId" onChange={(event) => updateDraft({ gameModeId: event.target.value })} value={draft.gameModeId ?? gameModes[0]?.id}>{gameModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select><LockNote field="gameModeId" /></label>}
      <label className={labelClass}>Deskripsi singkat<textarea className={`${inputClass} h-32 min-h-32 py-3`} disabled={Boolean(lockedReason("description"))} name="description" onChange={(event) => updateDraft({ description: event.target.value })} value={draft.description ?? ""} /><LockNote field="description" /></label>
    </section>
    <section className={activeStep === 1 ? "grid content-start scroll-mt-24 gap-6" : "hidden"} id="section-format" tabIndex={-1}>
      <div><h3 className="text-xl font-extrabold text-[var(--color-text)]">Tentukan format & jadwal.</h3><p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">Pilih bentuk kompetisi, jumlah peserta, lalu tentukan kapan pendaftaran dan event dimulai.</p></div>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <label className={labelClass}>Kapasitas tim<select className={inputClass} disabled={Boolean(lockedReason("participantCap"))} name="participantCap" onChange={(event) => updateDraft({ participantCap: Number(event.target.value) })} value={draft.participantCap ?? 16}>{[8, 12, 16, 24, 32, 64, 128, 256].map((cap) => <option key={cap} value={cap}>{cap} tim</option>)}</select><LockNote field="participantCap" /></label>
        <label className={labelClass}>Event dimulai<input className={inputClass} disabled={Boolean(lockedReason("eventStartsAt"))} name="eventStartsAt" onChange={(event) => updateDateDraft("eventStartsAt", event.target.value)} type="datetime-local" value={draft.eventStartsAt ?? ""} /><LockNote field="eventStartsAt" /></label>
        <label className={labelClass}>Zona waktu<select className={inputClass} disabled={Boolean(lockedReason("timezone"))} name="timezone" onChange={(event) => updateTimezone(event.target.value)} value={draft.timezone ?? "Asia/Jakarta"}>
          <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
          <option value="Asia/Makassar">WITA · Asia/Makassar</option>
          <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
        </select><LockNote field="timezone" /></label>
        <label className={labelClass}>Pelaksanaan<input className={inputClass} disabled={Boolean(lockedReason("venue"))} name="venue" onChange={(event) => updateDraft({ venue: event.target.value })} value={draft.venue ?? ""} /><LockNote field="venue" /></label>
        <label className={labelClass}>Platform / kanal pertandingan <span className="font-normal text-[var(--color-text-subtle)]">Opsional</span><input className={inputClass} disabled={Boolean(lockedReason("venueAddress"))} name="venueAddress" onChange={(event) => updateDraft({ venueAddress: event.target.value || null })} value={draft.venueAddress ?? ""} /><LockNote field="venueAddress" /></label>
      </div>
      <FormatConfigurator allowAdvanced={competitionOperationsEnabled} disabled={Boolean(lockedReason("formatConfig"))} lockedReason={lockedReason("formatConfig") ?? undefined} onChange={(formatConfig) => updateDraft({ formatConfig })} value={draft.formatConfig} />
    </section>
    <section className={activeStep === 2 ? "grid content-start scroll-mt-24 gap-4" : "hidden"} id="section-registration" tabIndex={-1}>
      <div><h3 className="text-xl font-extrabold text-[var(--color-text)]">Atur pendaftaran.</h3><p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">Tentukan kapan peserta bisa mendaftar, biaya yang berlaku, dan kontak organizer yang dapat dihubungi.</p></div><div className="grid gap-4 min-[700px]:grid-cols-2">
        <label className={labelClass}>Pendaftaran dibuka<input className={inputClass} disabled={Boolean(lockedReason("registrationOpensAt"))} name="registrationOpensAt" onChange={(event) => updateDateDraft("registrationOpensAt", event.target.value)} type="datetime-local" value={draft.registrationOpensAt ?? ""} /><LockNote field="registrationOpensAt" /></label>
        <label className={labelClass}>Pendaftaran ditutup<input className={inputClass} disabled={Boolean(lockedReason("registrationClosesAt"))} name="registrationClosesAt" onChange={(event) => updateDateDraft("registrationClosesAt", event.target.value)} type="datetime-local" value={draft.registrationClosesAt ?? ""} /><LockNote field="registrationClosesAt" /></label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[var(--color-text)]"><input checked={draft.registrationFeeRequired ?? false} disabled={Boolean(lockedReason("registrationFeeRequired"))} name="registrationFeeRequired" onChange={(event) => updateDraft({ registrationFeeRequired: event.target.checked })} type="checkbox" />Pendaftaran berbayar<LockNote field="registrationFeeRequired" /></label>
      {draft.registrationFeeRequired && <label className={labelClass}>Biaya pendaftaran<input className={inputClass} disabled={Boolean(lockedReason("registrationFeeAmount"))} min="0" name="registrationFeeAmount" onChange={(event) => updateDraft({ registrationFeeAmount: event.target.value ? Number(event.target.value) : null })} type="number" value={draft.registrationFeeAmount ?? ""} /><LockNote field="registrationFeeAmount" /></label>}{registrationPanel}
    </section>
    <section className={activeStep === 3 ? "grid content-start scroll-mt-24 gap-4" : "hidden"} id="section-public" tabIndex={-1}>
      <div><h3 className="text-xl font-extrabold text-[var(--color-text)]">Siapkan halaman publik.</h3><p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">Tambahkan poster untuk halaman event dan logo kecil untuk identitas event. Keduanya punya tempat yang berbeda.</p></div>
      <label className={labelClass}>Informasi hadiah<input className={inputClass} disabled={Boolean(lockedReason("prizePoolLabel"))} name="prizePoolLabel" onChange={(event) => updateDraft({ prizePoolLabel: event.target.value || null })} placeholder="Contoh: Rp5.000.000 + merchandise" value={draft.prizePoolLabel ?? ""} /><LockNote field="prizePoolLabel" /></label>      {visualEditor ?? <div className="grid gap-4 min-[700px]:grid-cols-2">
        <form action={organizerUploadEventVisualAction} className="grid content-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-5">
          <input name="eventId" type="hidden" value={eventId} /><input name="locale" type="hidden" value={locale} />
          <label className={labelClass}>Visual promosi untuk halaman event <span className="font-normal text-[var(--color-text-subtle)]">PNG atau JPG · disarankan 4:5 · maks. 2 MB</span><input accept="image/png,image/jpeg,image/webp" className={inputClass} name="eventVisual" required type="file" /></label>
          <label className="flex items-start gap-3 text-sm text-[var(--color-text)]"><input className="mt-1" name="rightsAttestation" required type="checkbox" value="confirmed" />Saya memiliki izin untuk menerbitkan karya visual ini.</label>
          <button className="min-h-11 border border-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)]" type="submit">Unggah poster</button>
        </form>
        <form action={organizerUploadEventLogoAction} className="grid content-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-5">
          <input name="eventId" type="hidden" value={eventId} /><input name="locale" type="hidden" value={locale} />
          <label className={labelClass}>Identitas kecil untuk event-mu <span className="font-normal text-[var(--color-text-subtle)]">PNG atau JPG · persegi 1:1 · maks. 2 MB</span><input accept="image/png,image/jpeg,image/webp" className={inputClass} name="eventLogo" required type="file" /></label>
          <button className="min-h-11 border border-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)]" type="submit">Unggah logo</button>
        </form>
      </div>}
    </section>
    <section className={activeStep === 4 ? "grid content-start scroll-mt-24 gap-6" : "hidden"} id="section-review" tabIndex={-1}>
      {reviewPanel ?? <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-4 text-sm text-[var(--color-text-subtle)]">Lengkapi detail event, lalu kembali ke sini untuk meninjau dan menerbitkan.</div>}
    </section>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-5" data-workspace-step-controls>
        <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-sm font-extrabold text-[var(--color-text)] disabled:opacity-40" disabled={activeStep === 0} onClick={() => moveToStep(activeStep - 1)} type="button">Kembali</button>
        <p className="text-sm font-semibold text-[var(--color-text-subtle)]">Step {activeStep + 1} of {stepIds.length}</p>
        {activeStep < stepIds.length - 1 ? <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--color-brand-violet)] px-4 text-sm font-extrabold text-white" onClick={() => moveToStep(activeStep + 1)} type="button">Lanjut</button> : <span className="px-2 text-sm font-bold text-[var(--color-text-subtle)]">Siap diterbitkan</span>}
      </div>
      </div>
      <LiveDraftPreview draft={draft} editorLabel={editorLabel} />
    </div>
  </section>;
}
