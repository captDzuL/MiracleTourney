import React from "react";
import { redirect } from "next/navigation";

import {
  adminCreateEventAction,
  adminImportTeamsCsvAction,
  adminUpdateStreamAction,
} from "@/lib/actions";
import { DataTable, ImportResultBanner, Pill, Section, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import {
  getEventBySlug,
  getEvents,
  getGameForEvent,
  getGameModes,
  getLeaderboardForEvent,
  getMatchesForEvent,
  getTeamsForEvent,
} from "@/lib/platform/demo-store";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{
    success?: string;
    count?: string;
    importError?: string;
    error?: string;
  }>;
}) {
  const user = await requireRole("admin");
  if (!user) redirect("/login");
  const resolvedSearchParams = await searchParams;

  const events = getEvents();
  const featuredEvent = getEventBySlug("kuroko-summer-cup") ?? events[0];
  const gameModes = getGameModes();

  return (
    <div className="space-y-6">
      <Section
        title={`Admin panel · ${user.name}`}
        description="Create events, wire live streams, and monitor the public tournament surface."
      >
        <ImportResultBanner
          success={resolvedSearchParams?.success}
          count={resolvedSearchParams?.count}
          importError={resolvedSearchParams?.importError}
          error={resolvedSearchParams?.error}
        />
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Tracked events" value={events.length} hint="Draft + public + ongoing" />
          <StatCard
            label="Featured teams"
            value={featuredEvent ? getTeamsForEvent(featuredEvent.id).length : 0}
            hint="Registration and roster scope"
          />
          <StatCard
            label="Recorded matches"
            value={featuredEvent ? getMatchesForEvent(featuredEvent.id).length : 0}
            hint="Current event operations"
          />
          <StatCard
            label="Leaderboard entries"
            value={featuredEvent ? getLeaderboardForEvent(featuredEvent.id).length : 0}
            hint="Aggregated personal stats"
          />
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Create event" description="Admin event bootstrap for one game mode at a time.">
          <form action={adminCreateEventAction} className="grid gap-4">
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
            <button
              className="rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950"
              type="submit"
            >
              Create draft event
            </button>
          </form>
        </Section>

        <Section
          title="Attach live stream"
          description="Lightweight event-level stream for semifinal/final coverage."
        >
          {featuredEvent ? (
            <form action={adminUpdateStreamAction} className="grid gap-4">
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
              <button
                className="rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
                type="submit"
              >
                Update stream metadata
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-400">Create at least one event to attach a stream.</p>
          )}
        </Section>

        <Section
          title="Import teams from CSV"
          description="Upload a roster CSV to add teams in one atomic admin action."
        >
          <form action={adminImportTeamsCsvAction} className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              Upload a roster CSV
              <input
                type="file"
                name="csvFile"
                accept=".csv,text/csv"
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
              />
            </label>
            <a href="/templates/team-import-template.csv" className="text-sm text-cyan-300 underline">
              Download CSV template
            </a>
            <button
              type="submit"
              className="rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950"
            >
              Import teams
            </button>
          </form>
        </Section>
      </div>

      <Section title="Operations overview" description="Everything the public site is currently exposing.">
        <DataTable
          columns={["Event", "Game", "Status", "Format", "Teams", "Matches"]}
          rows={events.map((event) => [
            event.name,
            getGameForEvent(event).name,
            (
              <Pill
                key={`${event.id}-status`}
                tone={event.status === "Ongoing" ? "live" : "default"}
              >
                {event.status}
              </Pill>
            ),
            event.format,
            getTeamsForEvent(event.id).length,
            getMatchesForEvent(event.id).length,
          ])}
        />
      </Section>
    </div>
  );
}
