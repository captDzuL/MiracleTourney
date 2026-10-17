// Roster tab of the captain dashboard: teams and the draft team form.
// Moved out of page.tsx without changes (refactor Phase 4, 4b-captain).

import { inputClass, labelClass, primaryButton } from "@/app/captain/dashboard/shared";
import type { TFn } from "@/app/captain/dashboard/shared";
import { ChampionCertificateBanner, TeamSection } from "@/app/captain/dashboard/team-section";
import { RosterChangePanel } from "@/components/captain/RosterChangePanel";
import { SubmitButton } from "@/components/submit-button";
import { captainSaveDraftTeamAction } from "@/lib/actions/registration-actions";
import type { RosterChangeOverview } from "@/lib/platform/roster-change-requests";
import { getGameForEvent, getModeForEvent } from "@/lib/platform/settings-repository";
import type { Certificate, Event, Player, Team } from "@/lib/platform/types";

export function RosterManagementSection({

  teamsWithPlayers,

  draftTeamWithPlayers,

  events,

  certificates,
  rosterOverviews,
  editPlayerId,

  confirmDeleteId,

  canDraft,

  t,

}: {

  teamsWithPlayers: Array<{ team: Team; players: Player[] }>;

  draftTeamWithPlayers: { team: Team; players: Player[] } | null;

  events: Event[];

  certificates: Map<string, Certificate | null>;
  rosterOverviews: Map<string, RosterChangeOverview | null>;
  editPlayerId?: string;

  confirmDeleteId?: string;

  /** False for a player who captains a solo team: only captain accounts keep a reusable draft team. */
  canDraft: boolean;

  t: TFn;

}) {

  const registeredTeamsWithPlayers = teamsWithPlayers.filter(({ team }) => Boolean(team.eventId));


  return (

    <section className="space-y-4">

      <div>

        <h2 className="text-lg font-semibold text-slate-950">{t("rosterManagementTitle")}</h2>

        <p className="mt-1 text-sm text-slate-500">{t(canDraft ? "rosterManagementDescription" : "rosterManagementOwnerDescription")}</p>

      </div>


      {canDraft ? <DraftTeamForm team={draftTeamWithPlayers?.team ?? null} t={t} /> : null}


      {registeredTeamsWithPlayers.length === 0 && !draftTeamWithPlayers ? (

        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">

          {t("noRegisteredTeams")}

        </p>

      ) : (

        <div className="space-y-8">

          {draftTeamWithPlayers ? (

            <TeamSection

              team={draftTeamWithPlayers.team}

              players={draftTeamWithPlayers.players}

              editPlayerId={editPlayerId}

              confirmDeleteId={confirmDeleteId}

              t={t}

            />

          ) : null}


          {registeredTeamsWithPlayers.map(({ team, players }) => {

            const event = events.find((item) => item.id === team.eventId);

            if (!event) return null;

            const game = getGameForEvent(event);

            const mode = getModeForEvent(event);

            const cert = certificates.get(team.id) ?? null;
            const rosterOverview = rosterOverviews.get(team.id) ?? null;
            const drawn = team.source === "solo-draw";
            const rosterEditable = !drawn && (!rosterOverview || rosterOverview.window === "free");


            return (

              <div key={team.id} className="space-y-4">

                {cert ? <ChampionCertificateBanner cert={cert} event={event} team={team} /> : null}

                <TeamSection

                  team={team}

                  event={event}

                  game={game}

                  mode={mode}

                  players={players}
                  rosterEditable={rosterEditable}

                  editPlayerId={editPlayerId}

                  confirmDeleteId={confirmDeleteId}

                  t={t}
                />
                {drawn && (!rosterOverview || rosterOverview.window === "free") ? (
                  <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{t("soloRosterNote")}</p>
                ) : null}
                {rosterOverview ? (
                  <RosterChangePanel team={team} players={players} positionOptions={mode?.positions ?? []} overview={rosterOverview} t={t} />
                ) : null}
              </div>
            );

          })}

        </div>

      )}

    </section>

  );

}

export function DraftTeamForm({ team, t }: { team: Team | null; t: TFn }) {

  return (

    <form action={captainSaveDraftTeamAction} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_8rem_auto] sm:items-end">

      <div className="sm:col-span-3">

        <h3 className="text-sm font-semibold text-slate-950">{t("draftTeamTitle")}</h3>

        <p className="mt-1 text-sm text-slate-500">{t("draftTeamDescription")}</p>

      </div>

      <label className={labelClass}>

        {t("teamName")}

        <input className={inputClass} name="name" placeholder={t("teamNamePlaceholder")} minLength={2} defaultValue={team?.name ?? ""} required />

      </label>

      <label className={labelClass}>

        {t("teamTag")}

        <input className={`${inputClass} uppercase`} name="tag" placeholder={t("teamTagPlaceholder")} minLength={2} maxLength={5} defaultValue={team?.tag ?? ""} required />

      </label>

      <SubmitButton className={primaryButton}>{t("saveDraftTeamSubmit")}</SubmitButton>

    </form>

  );

}
