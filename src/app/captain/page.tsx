import { redirect } from "next/navigation";

import { captainAddPlayerAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { getCaptainTeams, getEvents, getGameForEvent, getPlayersForTeam } from "@/lib/platform/demo-store";
import { DataTable, Pill, Section } from "@/components/ui";

export default async function CaptainPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string }>;
}) {
  const user = await requireRole("captain");
  if (!user) redirect("/login");
  const resolvedSearchParams = await searchParams;

  const teams = getCaptainTeams(user.id);
  const events = getEvents();
  const primaryTeam = teams[0];

  return (
    <div className="space-y-6">
      <Section
        title={`Captain dashboard · ${user.name}`}
        description="Roster completion is a post-launch follow-up; launch-week registration remains in Google Form."
      >
        <p className="mb-4 text-sm leading-6 text-cyan-100">
          This captain area is reserved for roster completion after the site is live.
        </p>
        {resolvedSearchParams?.success ? (
          <p className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Demo action completed: {resolvedSearchParams.success.replaceAll("-", " ")}.
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          {teams.map((team) => {
            const event = events.find((item) => item.id === team.eventId)!;
            const game = getGameForEvent(event);

            return (
              <div key={team.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
                    {team.logoText}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{team.name}</h3>
                    <p className="text-sm text-slate-400">{event.name}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Pill>{game.name}</Pill>
                  <Pill>{event.status}</Pill>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Launch-week registration" description="Registration remains in Google Form for this launch week.">
          <p className="text-sm leading-6 text-slate-300">
            Admins publish approved teams through CSV import. Once your team is published, return here for post-launch roster completion.
          </p>
        </Section>

        <Section title="Roster manager" description="Add players to your main roster before event lock-in.">
          {primaryTeam ? (
            <>
              <form action={captainAddPlayerAction} className="grid gap-4">
                <input type="hidden" name="teamId" value={primaryTeam.id} />
                <input type="hidden" name="eventId" value={primaryTeam.eventId} />
                <label className="grid gap-2 text-sm text-slate-300">
                  Display name
                  <input className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" name="displayName" placeholder="Player full name" />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Nickname
                  <input className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" name="nickname" placeholder="IGN" />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Position
                  <input className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3" name="position" placeholder="Forward / Guard / Goalkeeper" />
                </label>
                <button className="rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5" type="submit">
                  Add player
                </button>
              </form>

              <div className="mt-5">
                <DataTable
                  columns={["Player", "Nickname", "Position"]}
                  rows={getPlayersForTeam(primaryTeam.id).map((player) => [
                    player.displayName,
                    player.nickname,
                    player.position,
                  ])}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">An admin must publish your approved team before roster completion is available.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
