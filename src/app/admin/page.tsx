import { getTranslations } from "next-intl/server";

import { redirectToActiveLocale } from "@/i18n/redirect";
import {
  adminApproveStatAction,
  adminCreateEventAction,
  adminImportTeamsCsvAction,
  adminRejectStatAction,
  adminSetMatchGamesAction,
  adminSetRoundConfigAction,
  adminUpdateEventStatusAction,
  adminUpdateMatchResultAction,
  adminUpdateStreamAction,
} from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import {
  getBracketManageableMatchesForEvent,
  getEventBySlug,
  getEventRoundConfigs,
  getEvents,
  getGameForEvent,
  getGameModes,
  getImportedTeams,
  getLeaderboardForEvent,
  getMatchGames,
  getMatchesForEvent,
  getPendingStatSubmissionCount,
  getPendingStatSubmissions,
  getTeamsForEvent,
} from "@/lib/platform/repository";
import { buttonStyles, DataTable, Pill, Section, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

type AdminSearchParams = {
  success?: string;
  error?: string;
  count?: string;
  matchEventId?: string;
  matchId?: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<AdminSearchParams>;
}) {
  const user = await requireRole("admin");
  if (!user) {
    return redirectToActiveLocale("/login");
  }

  const t = await getTranslations("admin");
  const resolvedSearchParams = await searchParams;
  const events = await getEvents();
  const gameModes = getGameModes();

  const [allTeamsByEventArr, featuredEventFromSlug, importedTeamsRaw] = await Promise.all([
    Promise.all(events.map(async (event) => ({ eventId: event.id, teams: await getTeamsForEvent(event.id) }))),
    getEventBySlug("kuroko-summer-cup"),
    getImportedTeams(),
  ]);

  const allTeamsByEvent = new Map(allTeamsByEventArr.map(({ eventId, teams }) => [eventId, teams]));
  const allTeams = [...allTeamsByEvent.values()].flat();
  const teamName = (teamId: string | undefined) => allTeams.find((team) => team.id === teamId)?.name ?? "TBD";
  const featuredEvent = featuredEventFromSlug ?? events[0];

  const manageableEventsRaw = await Promise.all(
    events.map(async (event) => ({
      event,
      manageableMatches: await getBracketManageableMatchesForEvent(event),
    })),
  );
  const manageableEvents = manageableEventsRaw
    .map(({ event, manageableMatches }) => ({
      event,
      manageableMatches: manageableMatches.filter((m) => m.status !== "Completed"),
    }))
    .filter(({ manageableMatches }) => manageableMatches.length > 0);
  const selectedManageableEventId =
    manageableEvents.find(({ event }) => event.id === resolvedSearchParams?.matchEventId)?.event.id
    ?? manageableEvents[0]?.event.id;
  const selectedManageableEvent = manageableEvents.find(({ event }) => event.id === selectedManageableEventId);
  const manageableMatches = selectedManageableEvent?.manageableMatches ?? [];

  const [featuredMatches, featuredLeaderboard, pendingSubmissions, pendingCount] = featuredEvent
    ? await Promise.all([
        getMatchesForEvent(featuredEvent.id),
        getLeaderboardForEvent(featuredEvent.id, featuredEvent.gameId),
        getPendingStatSubmissions(),
        getPendingStatSubmissionCount(),
      ])
    : await Promise.all([
        Promise.resolve([] as Awaited<ReturnType<typeof getMatchesForEvent>>),
        Promise.resolve([] as Awaited<ReturnType<typeof getLeaderboardForEvent>>),
        getPendingStatSubmissions(),
        getPendingStatSubmissionCount(),
      ]);

  const importedTeams = importedTeamsRaw
    .map((team) => ({
      ...team,
      eventName: events.find((event) => event.id === team.eventId)?.name ?? "Unknown event",
    }))
    .reverse();

  const importedEventIds = new Set(importedTeamsRaw.map((t) => t.eventId));

  // Best of N data
  const selectedMatchId = resolvedSearchParams?.matchId;
  const [roundConfigs, selectedMatchGames] = await Promise.all([
    selectedManageableEvent ? getEventRoundConfigs(selectedManageableEvent.event.id) : Promise.resolve([]),
    selectedMatchId ? getMatchGames(selectedMatchId) : Promise.resolve([]),
  ]);
  const roundConfigMap = new Map(roundConfigs.map((c) => [c.roundLabel, c.bestOf]));
  const selectedMatch = selectedMatchId
    ? manageableMatches.find((m) => m.id === selectedMatchId)
    : undefined;
  const selectedMatchBestOf = selectedMatch ? (roundConfigMap.get(selectedMatch.roundLabel) ?? 1) : 1;

  return (
    <div className="space-y-6">
      <Section
        title={`Admin panel · ${user.name}`}
        description="Create events, publish them, import registrations, and keep the public tournament surface consistent."
      >
        {resolvedSearchParams?.success ? (
          <p className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Demo action completed: {resolvedSearchParams.success.replaceAll("-", " ")}
            {resolvedSearchParams.count ? ` (${resolvedSearchParams.count} teams).` : "."}
          </p>
        ) : null}
        {resolvedSearchParams?.error ? (
          <p className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {resolvedSearchParams.error}
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Tracked events" value={events.length} hint="Draft + public + ongoing" />
          <StatCard
            label="Featured teams"
            value={featuredEvent ? (allTeamsByEvent.get(featuredEvent.id)?.length ?? 0) : 0}
            hint="Registration and roster scope"
          />
          <StatCard
            label="Recorded matches"
            value={featuredMatches.length}
            hint="Current event operations"
          />
          <StatCard
            label="Player leaderboard rows"
            value={featuredLeaderboard.length}
            hint="Only appears after player stats are recorded"
          />
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section className="h-full" title="Create event" description="Admin event bootstrap for one game mode at a time.">
          <form action={adminCreateEventAction} className="grid h-full content-start gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              Event name
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                name="name"
                placeholder="Flashpeak Mid-Season Cup"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Slug
              <input
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                name="slug"
                placeholder="flashpeak-mid-season-cup"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Game mode
              <select
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                name="gameModeId"
                defaultValue={gameModes[0]?.id}
              >
                {gameModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                Format
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                  name="format"
                  defaultValue="Single Elimination"
                >
                  <option value="Single Elimination">Single Elimination</option>
                  <option value="League">League</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Participant cap
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                  name="participantCap"
                  defaultValue="8"
                >
                  <option value="8">8</option>
                  <option value="12">12</option>
                  <option value="16">16</option>
                  <option value="24">24</option>
                  <option value="32">32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                </select>
              </label>
            </div>
            <button className={buttonStyles.primary} type="submit">
              Create draft event
            </button>
          </form>
        </Section>

        <Section
          className="h-full"
          title="Update event status"
          description="Draft events stay admin-only until they are published."
        >
          {events.length ? (
            <form action={adminUpdateEventStatusAction} className="grid h-full content-start gap-4">
              <label className="grid gap-2 text-sm text-slate-300">
                Event
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                  name="eventId"
                  defaultValue={events[0]?.id}
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Status
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                  name="status"
                  defaultValue="Published"
                >
                  <option value="Draft">Draft</option>
                  <option value="Published">Published</option>
                  <option value="Registration Closed">Registration Closed</option>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Finished">Finished</option>
                </select>
              </label>
              <div className="pt-2">
                <button className={`${buttonStyles.secondary} w-full sm:w-auto`} type="submit">
                  Save event status
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-400">Create at least one event first.</p>
          )}
        </Section>

        <Section
          className="h-full"
          title="Attach live stream"
          description="Lightweight event-level stream for semifinal/final coverage."
        >
          {featuredEvent ? (
            <form action={adminUpdateStreamAction} className="grid h-full content-start gap-4">
              <input type="hidden" name="eventId" value={featuredEvent.id} />
              <p className="text-sm text-slate-300">
                Target event: <span className="font-medium text-white">{featuredEvent.name}</span>
              </p>
              <label className="grid gap-2 text-sm text-slate-300">
                Stream label
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                  name="label"
                  defaultValue={featuredEvent.stream?.label ?? "Semifinal broadcast"}
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Stream URL
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                  name="url"
                  defaultValue={featuredEvent.stream?.url ?? "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
                />
              </label>
              <div className="pt-2">
                <button className={`${buttonStyles.secondary} w-full sm:w-auto`} type="submit">
                  Update stream metadata
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-400">Create at least one event to attach a stream.</p>
          )}
        </Section>

      </div>

      {/* Match operations — full-width, two-step: pick match, then enter result */}
      <Section
        title={t("matchTitle")}
        description={t("matchDescription")}
      >
        {selectedManageableEvent ? (
          <div className="grid gap-6">
            {/* Event selector */}
            <form action="" className="flex flex-wrap items-end gap-3">
              <label className="grid gap-2 text-sm text-slate-300">
                Event
                <select
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                  name="matchEventId"
                  defaultValue={selectedManageableEvent.event.id}
                >
                  {manageableEvents.map(({ event, manageableMatches: eventMatches }) => (
                    <option key={event.id} value={event.id}>
                      {event.name} · {t("matchesRemaining", { n: eventMatches.length })}
                    </option>
                  ))}
                </select>
              </label>
              <button className={buttonStyles.secondary} type="submit">
                {t("changeEvent")}
              </button>
            </form>

            {/* Match list — semua match yang belum selesai, klik untuk pilih */}
            <div className="grid gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                {selectedManageableEvent.event.name} · {t("matchesRemaining", { n: manageableMatches.length })}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {manageableMatches.map((match) => {
                  const bo = roundConfigMap.get(match.roundLabel) ?? 1;
                  const isSelected = selectedMatch?.id === match.id;
                  return (
                    <a
                      key={match.id}
                      href={`?matchEventId=${selectedManageableEvent.event.id}&matchId=${match.id}`}
                      className={`group flex flex-col gap-1 rounded-2xl border px-4 py-3 transition ${
                        isSelected
                          ? "border-cyan-400/40 bg-cyan-500/10"
                          : "border-white/10 hover:border-white/20 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold uppercase tracking-widest ${isSelected ? "text-cyan-400" : "text-slate-500"}`}>
                          {match.roundLabel} · Match {match.slot}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${bo > 1 ? "bg-amber-500/20 text-amber-300" : "bg-slate-700 text-slate-400"}`}>
                          BO{bo}
                        </span>
                      </div>
                      <span className={`text-sm font-medium ${isSelected ? "text-white" : "text-slate-300 group-hover:text-white"}`}>
                        {teamName(match.homeTeamId)} <span className="text-slate-500">vs</span> {teamName(match.awayTeamId)}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Result entry — muncul setelah match dipilih */}
            {selectedMatch ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                {/* Header match yang dipilih */}
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      {selectedMatch.roundLabel} · Match {selectedMatch.slot}
                    </p>
                    <p className="mt-1 text-base font-semibold text-white">
                      {teamName(selectedMatch.homeTeamId)}{" "}
                      <span className="text-slate-400">vs</span>{" "}
                      {teamName(selectedMatch.awayTeamId)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${selectedMatchBestOf > 1 ? "bg-amber-500/20 text-amber-300" : "bg-slate-700 text-slate-300"}`}>
                      Best of {selectedMatchBestOf}
                    </span>
                    <a
                      href={`?matchEventId=${selectedManageableEvent.event.id}`}
                      className="text-sm text-slate-500 hover:text-slate-300"
                    >
                      {t("cancelAction")}
                    </a>
                  </div>
                </div>

                {/* BO1: langsung masukkan skor */}
                {selectedMatchBestOf === 1 && (
                  <form action={adminUpdateMatchResultAction} className="grid gap-4">
                    <input type="hidden" name="eventId" value={selectedManageableEvent.event.id} />
                    <input type="hidden" name="matchEventId" value={selectedManageableEvent.event.id} />
                    <input type="hidden" name="matchId" value={selectedMatch.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm text-slate-300">
                        {teamName(selectedMatch.homeTeamId)} (Home)
                        <input
                          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-lg font-semibold"
                          name="homeScore"
                          type="number"
                          min="0"
                          defaultValue="0"
                        />
                      </label>
                      <label className="grid gap-2 text-sm text-slate-300">
                        {teamName(selectedMatch.awayTeamId)} (Away)
                        <input
                          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-lg font-semibold"
                          name="awayScore"
                          type="number"
                          min="0"
                          defaultValue="0"
                        />
                      </label>
                    </div>
                    <div className="pt-1">
                      <button className={buttonStyles.primary} type="submit">
                        {t("saveResult")}
                      </button>
                    </div>
                  </form>
                )}

                {/* BO3/BO5: per-game entry */}
                {selectedMatchBestOf > 1 && (
                  <form action={adminSetMatchGamesAction} className="grid gap-4">
                    <input type="hidden" name="matchId" value={selectedMatch.id} />
                    <input type="hidden" name="matchEventId" value={selectedManageableEvent.event.id} />
                    <input type="hidden" name="bestOf" value={selectedMatchBestOf} />
                    <div className="grid gap-3">
                      {/* Column headers */}
                      <div className="grid grid-cols-[3rem_1fr_1fr] gap-3">
                        <div />
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{teamName(selectedMatch.homeTeamId)}</p>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{teamName(selectedMatch.awayTeamId)}</p>
                      </div>
                      {Array.from({ length: selectedMatchBestOf }, (_, i) => {
                        const gameNum = i + 1;
                        const existingGame = selectedMatchGames.find((g) => g.gameNumber === gameNum);
                        return (
                          <div key={gameNum} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-3">
                            <p className="text-xs font-semibold text-slate-500">G{gameNum}</p>
                            <input
                              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-center text-base font-semibold"
                              name={`game${gameNum}_home`}
                              type="number"
                              min="0"
                              defaultValue={existingGame?.homeScore ?? ""}
                              placeholder="—"
                            />
                            <input
                              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-center text-base font-semibold"
                              name={`game${gameNum}_away`}
                              type="number"
                              min="0"
                              defaultValue={existingGame?.awayScore ?? ""}
                              placeholder="—"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="pt-1">
                      <button className={buttonStyles.primary} type="submit">
                        {t("saveGames")}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("selectMatch")}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t("noMatches")}</p>
        )}
      </Section>

      {/* Best of N round configuration */}
      {selectedManageableEvent && (() => {
        const distinctRoundLabels = [...new Set(selectedManageableEvent.manageableMatches.map((m) => m.roundLabel))];
        if (distinctRoundLabels.length === 0) return null;
        return (
          <Section
            title={t("roundConfigTitle")}
            description={t("roundConfigDesc")}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {distinctRoundLabels.map((label) => {
                const currentBestOf = roundConfigMap.get(label) ?? 1;
                return (
                  <form key={label} action={adminSetRoundConfigAction} className="grid gap-2">
                    <input type="hidden" name="eventId" value={selectedManageableEvent.event.id} />
                    <input type="hidden" name="roundLabel" value={label} />
                    <label className="grid gap-2 text-sm text-slate-300">
                      {label}
                      <select
                        name="bestOf"
                        defaultValue={currentBestOf}
                        className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                      >
                        <option value="1">Best of 1</option>
                        <option value="3">Best of 3</option>
                        <option value="5">Best of 5</option>
                      </select>
                    </label>
                    <button className={`${buttonStyles.secondary} w-full`} type="submit">
                      {t("saveRoundConfig")}
                    </button>
                  </form>
                );
              })}
            </div>
          </Section>
        );
      })()}

      <Section title="Import teams from CSV" description="One row = one team. Use an existing event_slug and import team + PIC data only.">
        <form action={adminImportTeamsCsvAction} className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="grid gap-2 text-sm text-slate-300">
            CSV file
            <input
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
              name="csv"
              type="file"
              accept=".csv,text/csv"
            />
          </label>
          <button className={buttonStyles.primary} type="submit">
            Upload and import
          </button>
        </form>
        <p className="mt-3 text-sm text-slate-400">
          Required: <span className="mono">event_slug,team_name,team_tag,captain_name,captain_contact</span>
          {" · "}Optional: <span className="mono">captain_email</span>
        </p>
        <a className="mt-3 inline-flex text-sm text-cyan-300 hover:text-cyan-200" href="/templates/team-import-template.csv">
          Download CSV template
        </a>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Import-ready event slugs" description="Use one of these slugs in your CSV so registrations land in the right event.">
          <DataTable
            columns={["Event", "event_slug", "Status", "Teams", ""]}
            rows={events.map((event) => [
              event.name,
              <span key={`${event.id}-slug`} className="mono text-xs text-slate-700">{event.slug}</span>,
              <Pill key={`${event.id}-import-status`} tone={event.status === "Ongoing" ? "live" : "default"}>
                {event.status}
              </Pill>,
              allTeamsByEvent.get(event.id)?.length ?? 0,
              importedEventIds.has(event.id) ? (
                <a
                  key={`${event.id}-creds`}
                  className="whitespace-nowrap text-xs text-cyan-400 hover:text-cyan-300"
                  href={`/api/admin/captain-credentials?eventId=${event.id}`}
                >
                  Download credentials
                </a>
              ) : null,
            ])}
          />
        </Section>

        <Section title="Imported registrations" description="Review imported team and PIC data before you hand off captain access later.">
          {importedTeams.length ? (
            <DataTable
              columns={["Event", "Team", "Tag", "PIC", "Contact", "Source"]}
              rows={importedTeams.map((team) => [
                team.eventName,
                team.name,
                team.tag,
                team.captainName ?? "—",
                team.captainContact ?? "—",
                team.source ?? "—",
              ])}
            />
          ) : (
            <p className="text-sm text-slate-400">
              No CSV imports yet. After a successful upload, imported team and PIC rows will appear here.
            </p>
          )}
        </Section>
      </div>

      <Section title="Operations overview" description="Everything the public site is currently exposing.">
        <DataTable
          columns={["Event", "Game", "Status", "Format", "Teams", "Matches"]}
          rows={events.map((event) => [
            event.name,
            getGameForEvent(event).name,
            <Pill key={`${event.id}-status`} tone={event.status === "Ongoing" ? "live" : "default"}>
              {event.status}
            </Pill>,
            event.format,
            allTeamsByEvent.get(event.id)?.length ?? 0,
            featuredEvent?.id === event.id ? featuredMatches.length : 0,
          ])}
        />
      </Section>

      <Section
        title={`Stat Submissions${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}`}
        description="Captain-submitted match stats awaiting review. Approve to publish to leaderboard, or reject with a note."
      >
        {pendingSubmissions.length === 0 ? (
          <p className="text-sm text-slate-400">No pending submissions.</p>
        ) : (
          <div className="space-y-3">
            {pendingSubmissions.map((sub) => (
              <details key={sub.id} className="rounded-2xl border border-slate-200 bg-slate-50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {sub.matchLabel} · {sub.teamName}
                    </p>
                    <p className="text-xs text-slate-400">
                      {sub.eventName} · Submitted by {sub.captainEmail} ·{" "}
                      {new Date(sub.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    Pending
                  </span>
                </summary>

                <div className="border-t border-slate-200 p-4">
                  {/* Stats preview */}
                  <div className="mb-4 overflow-x-auto">
                    <table className="w-full text-xs text-slate-700">
                      <thead>
                        <tr>
                          <th className="py-1 text-left font-semibold uppercase tracking-widest text-slate-500">
                            Player ID
                          </th>
                          <th className="px-2 py-1 text-left font-semibold uppercase tracking-widest text-slate-500">
                            Stats
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(sub.stats).map(([playerId, stats]) => (
                          <tr key={playerId} className="border-t border-slate-100">
                            <td className="mono py-1.5 pr-3 text-slate-400">{playerId.slice(0, 12)}…</td>
                            <td className="py-1.5">
                              {Object.entries(stats).map(([k, v]) => (
                                <span key={k} className="mr-2 inline-block">
                                  <span className="text-slate-500">{k}:</span>{" "}
                                  <span className="text-slate-900">{v}</span>
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {/* Approve */}
                    <form action={adminApproveStatAction}>
                      <input type="hidden" name="submissionId" value={sub.id} />
                      <button className={buttonStyles.primary} type="submit">
                        {t("approve")}
                      </button>
                    </form>

                    {/* Reject */}
                    <form action={adminRejectStatAction} className="flex gap-2">
                      <input type="hidden" name="submissionId" value={sub.id} />
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
                        name="rejectionNote"
                        placeholder={t("rejectionNote")}
                      />
                      <button className={buttonStyles.secondary} type="submit">
                        {t("reject")}
                      </button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
