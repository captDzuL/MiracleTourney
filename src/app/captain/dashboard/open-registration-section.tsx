// Open registration events shown to the captain.
// Moved out of page.tsx without changes (refactor Phase 4, 4b-captain).

import { inputClass, labelClass, primaryButton, quietButton } from "@/app/captain/dashboard/shared";
import type { TFn } from "@/app/captain/dashboard/shared";
import { SubmitButton } from "@/components/submit-button";
import { Link } from "@/i18n/navigation";
import { captainRegisterTeamAction } from "@/lib/actions/registration-actions";
import type { Event, Team } from "@/lib/platform/types";

export function OpenRegistrationSection({

  events,

  draftTeam,

  draftPlayerCount,

  t,

}: {

  events: Array<Event & { registeredTeams: number }>;

  draftTeam: Team | null;

  draftPlayerCount: number;

  t: TFn;

}) {

  return (

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

        <div>

          <h2 className="text-lg font-semibold text-slate-950">{t("openRegistrationTitle")}</h2>

          <p className="mt-1 text-sm text-slate-500">{t("openRegistrationDescription")}</p>

        </div>

      </div>


      {events.length === 0 ? (

        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">

          {t("noOpenRegistration")}

        </p>

      ) : (

        <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">

          {events.map((event) => (

            <form key={event.id} action={captainRegisterTeamAction} data-registration-list-item="true" className="grid gap-4 p-4 lg:grid-cols-[minmax(12rem,1fr)_minmax(18rem,24rem)_auto] lg:items-end">

              <input type="hidden" name="eventId" value={event.id} />

              {draftTeam ? <input type="hidden" name="draftTeamId" value={draftTeam.id} /> : null}

              <div className="min-w-0">

                <p className="truncate text-base font-semibold text-slate-950">{event.name}</p>

                <p className="mt-1 text-sm text-slate-500">{event.startsAt} - {event.venue}</p>

                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">

                  {t("eventCapacity", { registered: event.registeredTeams, cap: event.participantCap })}

                </p>

              </div>

              {draftTeam ? (

                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">

                  <p className="font-semibold text-slate-950">{draftTeam.name} · {draftTeam.tag}</p>

                  <p className="mt-1">{t("registrationUsesDraft", { count: draftPlayerCount })}</p>

                </div>

              ) : (

                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">

                  <label className={labelClass}>

                    {t("teamName")}

                    <input className={inputClass} name="name" placeholder={t("teamNamePlaceholder")} minLength={2} required />

                  </label>

                  <label className={labelClass}>

                    {t("teamTag")}

                    <input className={`${inputClass} uppercase`} name="tag" placeholder={t("teamTagPlaceholder")} minLength={2} maxLength={5} required />

                  </label>

                </div>

              )}

              <label className={`${labelClass} lg:col-span-3`}>

                {t("captainContact")}

                <input className={inputClass} name="captainContact" defaultValue={draftTeam?.captainContact ?? ""} placeholder={t("captainContactPlaceholder")} inputMode="tel" minLength={6} required />

              </label>

              <div className="lg:justify-self-end">

                {draftTeam && draftPlayerCount === 0 ? (

                  <Link href="/captain?tab=roster" className={quietButton}>{t("completeDraftRosterFirst")}</Link>

                ) : (

                  <SubmitButton className={primaryButton}>{t("registerTeamSubmit")}</SubmitButton>

                )}

              </div>

            </form>

          ))}

        </div>

      )}

    </section>

  );

}
