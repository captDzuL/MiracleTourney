// Phase 1 of the admin workspace: prepare the event.
// Moved out of admin-workspace.tsx without changes (refactor Phase 4, 4a-admin).

import { EventOptions, PhaseSection, StatusChip, inputClass, labelClass, primaryButton, quietButton } from "@/app/admin/workspace/shared";
import type { AdminTranslator, CaptainUser, EventItem, GameModeItem, OrganizerItem, TeamItem } from "@/app/admin/workspace/shared";
import { EventVisualAssetsPanel } from "@/components/admin/EventVisualAssetsPanel";
import { SubmitButton } from "@/components/submit-button";
import { TeamAvatar, TeamIdentity } from "@/components/TeamAvatar";
import { Section } from "@/components/ui";
import { adminArchiveEventAction, adminCreateEventAction, adminUpdateEventPublicInfoAction, adminUpdateEventStatusAction, adminUpdateStreamAction } from "@/lib/actions/event-actions";
import { adminUploadEventLogoAction } from "@/lib/actions/event-visual-actions";
import { adminDeactivateUserAction } from "@/lib/actions/identity-actions";
import { adminUploadTeamLogoAction } from "@/lib/actions/team-actions";
import { getGameModeDisplayLabel } from "@/lib/platform/config";
import { getGameForEvent } from "@/lib/platform/settings-repository";
import type { EventVisualAsset } from "@/lib/platform/types";
import { getEventBackgroundUrl } from "@/lib/platform/visuals";
import { CalendarPlus, Eye, ImageUp, LinkIcon, Save, Send } from "lucide-react";
import Image from "next/image";

export function PrepareEventPhase({
  activeEvent,
  allTeamsByEvent,
  captainUsers,
  events,
  gameModes,
  organizerOptions,
  t,
  userRole,
  visualAssetsByEvent,
}: {
  activeEvent: EventItem | undefined;
  allTeamsByEvent: Map<string, TeamItem[]>;
  captainUsers: CaptainUser[];
  events: EventItem[];
  gameModes: GameModeItem[];
  organizerOptions: OrganizerItem[];
  t: AdminTranslator;
  userRole: string;
  visualAssetsByEvent: Map<string, EventVisualAsset[]>;
}) {
  return (
    <PhaseSection
      action={
        <a className={quietButton} href={activeEvent ? `../events/${activeEvent.slug}` : "../events"}>
          <Eye className="h-4 w-4" />
          {t("previewPublicPage")}
        </a>
      }
      description={t("prepareDescription")}
      title={t("prepareTitle")}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <Section title={t("createEventTitle")} description={t("createEventDescription")} className="rounded-xl shadow-none">
          <form action={adminCreateEventAction} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>
                {t("eventNameLabel")}
                <input className={inputClass} name="name" placeholder="Flashpeak Mid-Season Cup" />
              </label>
              <label className={labelClass}>
                {t("slugLabel")}
                <input className={inputClass} name="slug" placeholder="flashpeak-mid-season-cup" />
              </label>
              {userRole === "platform_admin" || userRole === "admin" ? (
                <label className={labelClass}>
                  {t("createEventOrganizerLabel")}
                  <select className={inputClass} name="organizerUserId" defaultValue="">
                    <option value="">{t("createEventOrganizerPlaceholder")}</option>
                    {organizerOptions.map((organizer) => (
                      <option key={organizer.id} value={organizer.id}>
                        {organizer.name} - {organizer.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={labelClass}>
                {t("gameModeLabel")}
                <select className={inputClass} name="gameModeId" defaultValue={gameModes[0]?.id}>
                  {gameModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {getGameModeDisplayLabel(mode.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                {t("formatLabel")}
                <select className={inputClass} name="format" defaultValue="Single Elimination">
                  <option value="Single Elimination">Single Elimination</option>
                  <option value="League">League</option>
                </select>
              </label>
              <label className={labelClass}>
                {t("capLabel")}
                <select className={inputClass} name="participantCap" defaultValue="8">
                  {["8", "12", "16", "24", "32", "64", "128", "256"].map((cap) => (
                    <option key={cap} value={cap}>
                      {cap}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <SubmitButton className={primaryButton}>
              <CalendarPlus className="h-4 w-4" />
              {t("createEventSubmit")}
            </SubmitButton>
          </form>
        </Section>

        <div className="grid gap-6">
          <Section title={t("statusTitle")} description={t("statusDescription")} className="rounded-xl shadow-none">
            {activeEvent ? (
              <form action={adminUpdateEventStatusAction} className="grid gap-4">
                <label className={labelClass}>
                  {t("eventLabel")}
                  <select className={inputClass} name="eventId" defaultValue={activeEvent.id}>
                    <EventOptions events={[activeEvent]} />
                  </select>
                </label>
                <label className={labelClass}>
                  {t("statusLabel")}
                  <select className={inputClass} name="status" defaultValue={activeEvent.status}>
                    {["Draft", "Published", "Registration Closed", "Ongoing", "Finished"].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton className={quietButton}>
                  <Send className="h-4 w-4" />
                  {t("saveStatus")}
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-slate-500">{t("noEventsImport")}</p>
            )}
          </Section>

          <Section title={t("streamTitle")} description={t("streamDescription")} className="rounded-xl shadow-none">
            {activeEvent ? (
              <form action={adminUpdateStreamAction} className="grid gap-4">
                <input type="hidden" name="eventId" value={activeEvent.id} />
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {t("targetEvent")}: <span className="font-semibold text-slate-950">{activeEvent.name}</span>
                </p>
                <label className={labelClass}>
                  {t("streamLabel")}
                  <input className={inputClass} name="label" defaultValue={activeEvent.stream?.label ?? "Semifinal broadcast"} />
                </label>
                <label className={labelClass}>
                  {t("streamUrl")}
                  <input className={inputClass} name="url" defaultValue={activeEvent.stream?.url ?? "https://www.youtube.com/watch?v=dQw4w9WgXcQ"} />
                </label>
                <SubmitButton className={quietButton}>
                  <LinkIcon className="h-4 w-4" />
                  {t("saveStream")}
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-slate-500">{t("noEventsStream")}</p>
            )}
          </Section>
        </div>
      </div>
      <PublicListingSettingsSection events={events} t={t} />
      <BrandAssetsSection allTeamsByEvent={allTeamsByEvent} events={events} t={t} visualAssetsByEvent={visualAssetsByEvent} />

      <Section title="Arsip / Hapus Event" description="Arsipkan event selesai atau hapus event Draft yang kosong." className="rounded-xl shadow-none">
        {events.length ? (
          <div className="grid gap-3">
            {events.map((event) => (
              <div key={event.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="flex-1 text-sm font-medium text-slate-800">{event.name} <span className="font-normal text-slate-500">({event.status})</span></span>
                <form action={adminArchiveEventAction} className="flex items-center gap-2">
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="action" value="archive" />
                  <SubmitButton className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
                    Arsipkan (Selesai)
                  </SubmitButton>
                </form>
                {event.status === "Draft" && (
                  <details className="relative">
                    <summary className="cursor-pointer rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100">
                      Hapus Event
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                      <p className="mb-2 text-xs text-slate-600">Hapus event Draft ini? Tindakan tidak dapat dibatalkan.</p>
                      <form action={adminArchiveEventAction}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="action" value="delete" />
                        <SubmitButton className="w-full rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500">
                          Konfirmasi Hapus
                        </SubmitButton>
                      </form>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Belum ada event.</p>
        )}
      </Section>

      {userRole === "platform_admin" && captainUsers.length > 0 && (
        <Section title="Nonaktifkan Pengguna" description="Hanya platform_admin. Akun kapten yang dinonaktifkan tidak dapat login." className="rounded-xl shadow-none">
          <div className="grid gap-3">
            {captainUsers.map((captain) => (
              <div key={captain.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="flex-1 text-sm text-slate-800">{captain.name} <span className="text-xs text-slate-500">({captain.email})</span></span>
                <details className="relative">
                  <summary className="cursor-pointer rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100">
                    Nonaktifkan
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                    <p className="mb-2 text-xs text-slate-600">Nonaktifkan {captain.name}? Kapten tidak dapat login setelah ini.</p>
                    <form action={adminDeactivateUserAction}>
                      <input type="hidden" name="userId" value={captain.id} />
                      <SubmitButton className="w-full rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500">
                        Konfirmasi Nonaktifkan
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </Section>
      )}
    </PhaseSection>
  );
}

export function PublicListingSettingsSection({
  events,
  t,
}: {
  events: EventItem[];
  t: AdminTranslator;
}) {
  return (
    <Section title="Public Listing Settings" description="Atur info yang tampil di card event depan dan halaman detail publik." className="rounded-xl shadow-none">
      {events.length ? (
        <div className="grid gap-4">
          {events.map((event) => (
            <details key={event.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{event.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {event.startsAt} - {event.prizePoolLabel ?? event.venue}
                  </p>
                </div>
                <StatusChip tone={event.registrationFeeLabel || event.registrationUrl ? "info" : "default"}>
                  {event.registrationFeeLabel ? event.registrationFeeLabel : "Listing info"}
                </StatusChip>
              </summary>

              <form action={adminUpdateEventPublicInfoAction} className="grid gap-4 border-t border-slate-200 bg-white p-4">
                <input type="hidden" name="eventId" value={event.id} />
                <label className={labelClass}>
                  Deskripsi event
                  <textarea
                    className={`${inputClass} min-h-28 resize-y leading-6`}
                    name="description"
                    defaultValue={event.description}
                    maxLength={500}
                    minLength={10}
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className={labelClass}>
                    Jadwal pendaftaran
                    <input className={inputClass} name="registrationWindow" defaultValue={event.registrationWindow} maxLength={120} minLength={2} />
                  </label>
                  <label className={labelClass}>
                    Tanggal mulai
                    <input className={inputClass} name="startsAt" defaultValue={event.startsAt} maxLength={120} minLength={2} />
                  </label>
                  <label className={labelClass}>
                    Venue
                    <input className={inputClass} name="venue" defaultValue={event.venue} maxLength={120} minLength={2} />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <label className={labelClass}>
                    Hadiah pemenang
                    <input className={inputClass} name="prizePoolLabel" defaultValue={event.prizePoolLabel ?? ""} maxLength={80} placeholder="Rp3.000.000" />
                  </label>
                  <label className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                    <input type="checkbox" name="registrationFeeRequired" defaultChecked={event.registrationFeeRequired} className="h-4 w-4 rounded border-slate-300 text-cyan-500" />
                    Event berbayar
                  </label>
                  <label className={labelClass}>
                    Nominal fee
                    <input className={inputClass} name="registrationFeeAmount" type="number" min="1" defaultValue={event.registrationFeeAmount ?? ""} placeholder="25000" />
                  </label>
                  <label className={labelClass}>
                    Label biaya
                    <input className={inputClass} name="registrationFeeLabel" defaultValue={event.registrationFeeLabel ?? ""} maxLength={80} placeholder="Rp20.000 / team" />
                  </label>
                  <label className={labelClass}>
                    Link pendaftaran
                    <input className={inputClass} name="registrationUrl" defaultValue={event.registrationUrl ?? ""} placeholder="https://..." />
                  </label>
                </div>
                <div className="flex justify-end">
                  <SubmitButton className={quietButton}>
                    <Save className="h-4 w-4" />
                    Simpan public info
                  </SubmitButton>
                </div>
              </form>
            </details>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("noEventsImport")}</p>
      )}
    </Section>
  );
}

export function BrandAssetsSection({
  allTeamsByEvent,
  events,
  t,
  visualAssetsByEvent,
}: {
  allTeamsByEvent: Map<string, TeamItem[]>;
  events: EventItem[];
  t: AdminTranslator;
  visualAssetsByEvent: Map<string, EventVisualAsset[]>;
}) {
  return (
    <Section title="Brand Assets" description="Upload logo event, background event, dan logo team untuk kartu publik dan halaman turnamen." className="rounded-xl shadow-none">
      {events.length ? (
        <div className="grid gap-4">
          {events.map((event) => {
            const teams = allTeamsByEvent.get(event.id) ?? [];
            const backgroundUrl = getEventBackgroundUrl(event);

            return (
              <details key={event.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                      {backgroundUrl ? (
                        <Image src={backgroundUrl} alt="" fill sizes="80px" loading="eager" unoptimized className="object-cover" />
                      ) : null}
                      <div className="absolute inset-0 bg-slate-950/35" />
                      <div className="absolute bottom-1 left-1">
                        <TeamAvatar logoText={event.name.slice(0, 2).toUpperCase()} logoUrl={event.logoUrl} name={event.name} size="sm" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{event.name}</p>
                      <p className="text-xs text-slate-500">{getGameForEvent(event).name} - {teams.length}/{event.participantCap} teams</p>
                    </div>
                  </div>
                  <StatusChip tone={event.logoUrl && backgroundUrl ? "success" : "default"}>
                    {event.logoUrl && backgroundUrl ? "Ready" : "Needs assets"}
                  </StatusChip>
                </summary>

                <div className="grid gap-5 border-t border-slate-200 bg-white p-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="grid gap-4">
                    <form action={adminUploadEventLogoAction} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <div className="flex items-center gap-3">
                        <TeamAvatar logoText={event.name.slice(0, 2).toUpperCase()} logoUrl={event.logoUrl} name={event.name} size="lg" />
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Event logo</p>
                          <p className="text-xs text-slate-500">PNG, JPG, atau WebP. Maks 2 MB.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input type="file" name="eventLogo" accept="image/png,image/webp,image/jpeg" className={`${inputClass} flex-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`} />
                        <SubmitButton className={quietButton}>
                          <ImageUp className="h-4 w-4" />
                          Upload
                        </SubmitButton>
                      </div>
                    </form>

                    <EventVisualAssetsPanel
                      activeAssetId={event.activeVisualAssetId ?? undefined}
                      assets={visualAssetsByEvent.get(event.id) ?? []}
                      eventId={event.id}
                      eventName={event.name}
                    />
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Team logos</p>
                        <p className="text-xs text-slate-500">Organizer mengelola logo semua team di event ini.</p>
                      </div>
                      <StatusChip tone="default">{teams.length} teams</StatusChip>
                    </div>
                    <div className="grid max-h-[30rem] gap-2 overflow-y-auto pr-1">
                      {teams.length ? teams.map((team) => (
                        <form key={team.id} action={adminUploadTeamLogoAction} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[minmax(10rem,1fr)_minmax(14rem,1fr)_auto] md:items-center">
                          <input type="hidden" name="teamId" value={team.id} />
                          <TeamIdentity logoText={team.logoText} logoUrl={team.logoUrl} name={team.name} meta={team.tag} />
                          <input type="file" name="teamLogo" accept="image/png,image/webp,image/jpeg" className={`${inputClass} min-w-0 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`} />
                          <SubmitButton className={quietButton}>
                            <ImageUp className="h-4 w-4" />
                            Upload
                          </SubmitButton>
                        </form>
                      )) : (
                        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Belum ada team di event ini.</p>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("noEventsImport")}</p>
      )}
    </Section>
  );
}
