import { redirect } from "next/navigation";

import {
  adminCreateEventAction,
  adminImportTeamsCsvAction,
  adminUpdateEventStatusAction,
  adminUpdateMatchResultAction,
  adminUpdateStreamAction,
} from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import {
  getBracketManageableMatches,
  getEventBySlug,
  getEvents,
  getGameForEvent,
  getGameModes,
  getImportedTeams,
  getLeaderboardForEvent,
  getMatchesForEvent,
  getTeamsForEvent,
} from "@/lib/platform/repository";
import { buttonStyles, DataTable, Pill, Section, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

type AdminSearchParams = {
  success?: string;
  error?: string;
  count?: string;
  matchEventId?: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<AdminSearchParams>;
}) {
  const user = await requireRole("admin");
  if (!user) redirect("/login");

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
      manageableMatches: await getBracketManageableMatches(event.id),
    })),
  );
  const manageableEvents = manageableEventsRaw.filter(({ manageableMatches }) => manageableMatches.length > 0);
  const selectedManageableEventId =
    manageableEvents.find(({ event }) => event.id === resolvedSearchParams?.matchEventId)?.event.id
    ?? manageableEvents[0]?.event.id;
  const selectedManageableEvent = manageableEvents.find(({ event }) => event.id === selectedManageableEventId);
  const manageableMatches = selectedManageableEvent?.manageableMatches ?? [];

  const [featuredMatches, featuredLeaderboard] = featuredEvent
    ? await Promise.all([getMatchesForEvent(featuredEvent.id), getLeaderboardForEvent(featuredEvent.id)])
    : [[], []];

  const importedTeams = importedTeamsRaw
    .map((team) => ({
      ...team,
      eventName: events.find((event) => event.id === team.eventId)?.name ?? "Unknown event",
    }))
    .reverse();

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

      <div className="grid gap-6 lg:grid-cols-3">
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

        <Section
          className="h-full"
          title="Match operations"
          description="Record match outcomes and drive bracket advancement from the admin panel."
        >
          {selectedManageableEvent ? (
            <div className="grid h-full content-start gap-4">
              <form action="/admin" className="grid gap-4">
                <label className="grid gap-2 text-sm text-slate-300">
                  Choose event
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                    name="matchEventId"
                    defaultValue={selectedManageableEvent.event.id}
                  >
                    {manageableEvents.map(({ event, manageableMatches: eventMatches }) => (
                      <option key={event.id} value={event.id}>
                        {event.name} · {eventMatches.length} manageable matches
                      </option>
                    ))}
                  </select>
                </label>
                <button className={`${buttonStyles.secondary} w-full sm:w-auto`} type="submit">
                  Load event matches
                </button>
              </form>

              <form action={adminUpdateMatchResultAction} className="grid gap-4">
                <input type="hidden" name="eventId" value={selectedManageableEvent.event.id} />
                <p className="text-sm text-slate-300">
                  Event: <span className="font-medium text-white">{selectedManageableEvent.event.name}</span>
                </p>
                <label className="grid gap-2 text-sm text-slate-300">
                  Match
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                    name="matchId"
                    defaultValue={manageableMatches[0]?.id}
                  >
                    {manageableMatches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {match.roundLabel} · Match {match.slot} · {teamName(match.homeTeamId)} vs {teamName(match.awayTeamId)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    Home score
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                      name="homeScore"
                      type="number"
                      min="0"
                      defaultValue="0"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Away score
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
                      name="awayScore"
                      type="number"
                      min="0"
                      defaultValue="0"
                    />
                  </label>
                </div>
                <div className="pt-2">
                  <button className={`${buttonStyles.secondary} w-full sm:w-auto`} type="submit">
                    Save match result
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Create a bracket event with manageable matches first.</p>
          )}
        </Section>
      </div>

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
          Required columns: <span className="mono">event_slug,team_name,team_tag,captain_name,captain_contact</span>
        </p>
        <a className="mt-3 inline-flex text-sm text-cyan-300 hover:text-cyan-200" href="/templates/team-import-template.csv">
          Download CSV template
        </a>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Import-ready event slugs" description="Use one of these slugs in your CSV so registrations land in the right event.">
          <DataTable
            columns={["Event", "event_slug", "Status", "Teams"]}
            rows={events.map((event) => [
              event.name,
              <span key={`${event.id}-slug`} className="mono text-xs text-slate-700">{event.slug}</span>,
              <Pill key={`${event.id}-import-status`} tone={event.status === "Ongoing" ? "live" : "default"}>
                {event.status}
              </Pill>,
              allTeamsByEvent.get(event.id)?.length ?? 0,
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
    </div>
  );
}
