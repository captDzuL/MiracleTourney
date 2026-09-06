"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { organizerUploadEventLogoAction, organizerUploadEventVisualAction } from "@/lib/actions";
import { saveEventDraftAction } from "@/lib/actions/event-v3-actions";
import { eventDateToLocalInput, eventLocalInputToIso } from "@/lib/events/event-datetime";
import { tournamentFormatConfigSchema, type TournamentFormatConfig } from "@/lib/tournament/formats/types";
import { DraftStatus } from "./DraftStatus";
import { FormatConfigurator } from "./FormatConfigurator";

type DraftPatch = {
  name?: string;
  slug?: string;
  description?: string;
  formatConfig?: TournamentFormatConfig;
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
}) => Promise<{ status: "saved" | "conflict" | "not_editable"; revision: number; fields: object; retry?: true }>;

type DraftStatusState = "saved" | "unsaved" | "saving" | "conflict" | "not_editable" | "error";
type SaveAttempt = { expectedRevision: number; mutationId: string; patch: DraftPatch };
type DraftJournal = {
  revision: number;
  mutationId?: string;
  patch: DraftPatch;
  retryAttempt?: SaveAttempt;
  queuedAfterAttempt?: boolean;
};

function journalKey(eventId: string) {
  return `miracle:event-draft:${eventId}`;
}

function readJournal(eventId: string, revision: number): DraftJournal | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(journalKey(eventId)) ?? "null") as Partial<DraftJournal> | null;
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
    if (typeof parsed.patch.slug === "string") patch.slug = parsed.patch.slug;
    if (typeof parsed.patch.description === "string") patch.description = parsed.patch.description;
    for (const field of ["registrationOpensAt", "registrationClosesAt", "eventStartsAt", "venueAddress", "logoUrl", "gameImageUrl"] as const) {
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

type EventDraftFormProps = {
  eventId: string;
  locale?: "id" | "en";
  initialDraft: Omit<DraftPatch, "name" | "formatConfig"> & {
    name: string;
    formatConfig: TournamentFormatConfig | null;
  };
  initialRevision: number;
  competitionOperationsEnabled?: boolean;
  saveDraft?: SaveDraft;
};

export function EventDraftForm({
  eventId,
  locale = "en",
  initialDraft,
  initialRevision,
  competitionOperationsEnabled = true,
  saveDraft = saveEventDraftAction,
}: EventDraftFormProps) {
  const router = useRouter();
  const [recoveredJournal] = useState(() => readJournal(eventId, initialRevision));
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

  useEffect(() => {
    if ((!pendingPatch && !retryAttemptRef.current) || saveInFlight.current) return;
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
          eventId,
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
            localStorage.removeItem(journalKey(eventId));
            setStatus("saved");
          } else {
            const queuedPatch = pendingPatchRef.current;
            if (queuedPatch) localStorage.setItem(journalKey(eventId), JSON.stringify({
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
        if (queuedPatch) localStorage.setItem(journalKey(eventId), JSON.stringify({
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
  }, [eventId, pendingPatch, revision, router, saveCycle, saveDraft]);

  function updateDraft(patch: DraftPatch) {
    setDraft((current) => ({ ...current, ...patch }));
    queuePatch(patch);
  }

  function queuePatch(patch: DraftPatch) {
    setPendingPatch((current) => {
      const nextPatch = { ...current, ...patch };
      pendingMutationIdRef.current = crypto.randomUUID();
      pendingPatchRef.current = nextPatch;
      localStorage.setItem(journalKey(eventId), JSON.stringify({
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
  const inputClass = "min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]";
  const labelClass = "grid gap-2 text-sm font-bold text-[var(--color-text)]";

  return <section aria-labelledby="event-details-heading" className="grid gap-8">
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-xl font-extrabold text-[var(--color-text)]" id="event-details-heading">Event details</h2>
      <div className="flex items-center gap-3">
        <DraftStatus state={status} />
        {status === "error" && <button
          className="text-sm font-bold text-[var(--color-brand-cyan)]"
          data-retry-save
          onClick={() => {
            setStatus("unsaved");
            setSaveCycle((cycle) => cycle + 1);
          }}
          type="button"
        >Retry</button>}
      </div>
    </div>
    <section className="grid scroll-mt-24 gap-4" id="section-identity" tabIndex={-1}>
      <h3 className="text-base font-extrabold text-[var(--color-text)]">Identity</h3>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <label className={labelClass}>Event name<input className={inputClass} name="name" onChange={(event) => updateDraft({ name: event.target.value })} value={draft.name} /></label>
        <label className={labelClass}>Public URL<input className={inputClass} name="slug" onChange={(event) => updateDraft({ slug: event.target.value })} value={draft.slug ?? ""} /></label>
      </div>
      <label className={labelClass}>Description<textarea className={`${inputClass} min-h-28 py-3`} name="description" onChange={(event) => updateDraft({ description: event.target.value })} value={draft.description ?? ""} /></label>
    </section>
    <section className="grid scroll-mt-24 gap-4 border-t border-[var(--color-border)] pt-6" id="section-schedule" tabIndex={-1}>
      <div><h3 className="text-base font-extrabold text-[var(--color-text)]">Schedule</h3><p className="mt-1 text-sm text-[var(--color-text-subtle)]">Times use the event timezone.</p></div>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <label className={labelClass}>Registration opens<input className={inputClass} name="registrationOpensAt" onChange={(event) => updateDateDraft("registrationOpensAt", event.target.value)} type="datetime-local" value={draft.registrationOpensAt ?? ""} /></label>
        <label className={labelClass}>Registration closes<input className={inputClass} name="registrationClosesAt" onChange={(event) => updateDateDraft("registrationClosesAt", event.target.value)} type="datetime-local" value={draft.registrationClosesAt ?? ""} /></label>
        <label className={labelClass}>Event starts<input className={inputClass} name="eventStartsAt" onChange={(event) => updateDateDraft("eventStartsAt", event.target.value)} type="datetime-local" value={draft.eventStartsAt ?? ""} /></label>
        <label className={labelClass}>Timezone<select className={inputClass} name="timezone" onChange={(event) => updateTimezone(event.target.value)} value={draft.timezone ?? "Asia/Jakarta"}>
          <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
          <option value="Asia/Makassar">WITA · Asia/Makassar</option>
          <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
        </select></label>
        <label className={labelClass}>Venue<input className={inputClass} name="venue" onChange={(event) => updateDraft({ venue: event.target.value })} value={draft.venue ?? ""} /></label>
        <label className={labelClass}>Venue address <span className="font-normal text-[var(--color-text-subtle)]">Optional</span><input className={inputClass} name="venueAddress" onChange={(event) => updateDraft({ venueAddress: event.target.value || null })} value={draft.venueAddress ?? ""} /></label>
      </div>
    </section>
    <section className="grid scroll-mt-24 gap-4 border-t border-[var(--color-border)] pt-6" id="section-registration" tabIndex={-1}>
      <h3 className="text-base font-extrabold text-[var(--color-text)]">Registration</h3>
      <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[var(--color-text)]"><input checked={draft.registrationFeeRequired ?? false} name="registrationFeeRequired" onChange={(event) => updateDraft({ registrationFeeRequired: event.target.checked })} type="checkbox" />Paid registration</label>
      {draft.registrationFeeRequired && <label className={labelClass}>Registration fee<input className={inputClass} min="0" name="registrationFeeAmount" onChange={(event) => updateDraft({ registrationFeeAmount: event.target.value ? Number(event.target.value) : null })} type="number" value={draft.registrationFeeAmount ?? ""} /></label>}
    </section>
    <section className="grid scroll-mt-24 gap-4 border-t border-[var(--color-border)] pt-6" id="section-visuals" tabIndex={-1}>
      <div><h3 className="text-base font-extrabold text-[var(--color-text)]">Event visuals</h3><p className="mt-1 text-sm text-[var(--color-text-subtle)]">Use a wide poster for the event page and a compact logo for event identity.</p></div>
      <label className={labelClass}>Poster image URL<input className={inputClass} name="gameImageUrl" onChange={(event) => updateDraft({ gameImageUrl: event.target.value || null })} value={draft.gameImageUrl ?? ""} /></label>
      <label className={labelClass}>Event logo URL<input className={inputClass} name="logoUrl" onChange={(event) => updateDraft({ logoUrl: event.target.value || null })} value={draft.logoUrl ?? ""} /></label>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <form action={organizerUploadEventVisualAction} className="grid gap-3 border border-[var(--color-border)] p-4">
          <input name="eventId" type="hidden" value={eventId} /><input name="locale" type="hidden" value={locale} />
          <label className={labelClass}>Upload poster<input accept="image/png,image/jpeg,image/webp" className={inputClass} name="eventVisual" required type="file" /></label>
          <label className="flex items-start gap-3 text-sm text-[var(--color-text)]"><input className="mt-1" name="rightsAttestation" required type="checkbox" value="confirmed" />I have permission to publish this artwork.</label>
          <button className="min-h-11 border border-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)]" type="submit">Upload poster</button>
        </form>
        <form action={organizerUploadEventLogoAction} className="grid content-start gap-3 border border-[var(--color-border)] p-4">
          <input name="eventId" type="hidden" value={eventId} /><input name="locale" type="hidden" value={locale} />
          <label className={labelClass}>Upload event logo<input accept="image/png,image/jpeg,image/webp" className={inputClass} name="eventLogo" required type="file" /></label>
          <button className="min-h-11 border border-[var(--color-brand-cyan)] px-4 text-sm font-extrabold text-[var(--color-brand-cyan)]" type="submit">Upload logo</button>
        </form>
      </div>
    </section>
    <section className="scroll-mt-24 border-t border-[var(--color-border)] pt-6" id="section-format" tabIndex={-1}>
      <FormatConfigurator allowAdvanced={competitionOperationsEnabled} onChange={(formatConfig) => updateDraft({ formatConfig })} value={draft.formatConfig} />
    </section>
  </section>;
}