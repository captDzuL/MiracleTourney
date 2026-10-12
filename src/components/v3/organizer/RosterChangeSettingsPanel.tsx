import * as React from "react";

import {
  organizerDecideRosterChangeAction,
  organizerSetRosterChangeLimitAction,
} from "@/lib/actions/organizer-roster-change-actions";
import type { PlayerSnapshot, RosterChangeRequestView, RosterChangeSettings } from "@/lib/platform/roster-change-settings";

type TFn = (key: string, values?: Record<string, string | number>) => string;

type Props = {
  eventId: string;
  settings: RosterChangeSettings;
  /** Codes from the address bar. Only the lists below are ever shown. */
  result?: string;
  error?: string;
  t: TFn;
};

const KNOWN_RESULTS = new Set(["approved", "rejected", "limit_saved"]);
const KNOWN_ERRORS = new Set([
  "request_not_found", "request_not_pending", "window_closed", "team_disqualified", "match_live", "no_allowance",
  "player_not_found", "captain_player", "roster_size", "already_on_roster", "nickname_taken", "invalid_change",
  "team_not_found", "rate_limited", "invalid_limit", "limit_below_used", "format_not_supported", "locked", "forbidden",
]);

const panel = "grid min-w-0 gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5";
const control = "min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-bold miracle-focus-ring";
const field = "min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-transparent px-3 py-2 text-sm miracle-focus-ring";
const muted = "text-sm text-[var(--color-text-muted)]";

function PlayerLine({ label, player }: { label: string; player: PlayerSnapshot | null }) {
  if (!player) return null;
  return (
    <p className="break-words text-sm">
      <span className="font-bold">{label}: </span>
      {player.nickname} <span className={muted}>({player.displayName}{player.position ? ` · ${player.position}` : ""})</span>
    </p>
  );
}

function PendingRequest({ item, eventId, limit, t }: { item: RosterChangeRequestView; eventId: string; limit: number; t: TFn }) {
  return (
    <li className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="break-words text-base font-extrabold">{item.teamName}</p>
        <p className={muted}>{t(`kind.${item.kind}`)} · {t("usage", { used: item.teamUsed, limit })}</p>
      </div>
      <PlayerLine label={t("leaving")} player={item.outgoing} />
      <PlayerLine label={t("joining")} player={item.incoming} />
      {item.returning ? <p className="text-sm font-bold">{t("returning")}</p> : null}
      {item.activeElsewhere.length > 0 ? (
        <p className="rounded-[var(--radius-control)] border border-amber-400 px-3 py-2 text-sm font-bold" role="alert">
          {t("alsoOn", { teams: item.activeElsewhere.join(", ") })}
        </p>
      ) : null}
      <form action={organizerDecideRosterChangeAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="requestId" value={item.id} />
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-bold">
          {t("note")}
          {/* A textarea, not a text input: Enter must add a line, never submit with the first button (Approve). */}
          <textarea className={field} name="note" rows={2} maxLength={200} />
        </label>
        <button type="submit" name="decision" value="approve" className={`${control} bg-[var(--color-accent-cyan)] text-[var(--color-accent-cyan-foreground)]`}>{t("approve")}</button>
        <button type="submit" name="decision" value="reject" className={control}>{t("reject")}</button>
      </form>
    </li>
  );
}

/** Shown in place of the panel when it cannot load, so a waiting request is never silently out of reach. */
export function RosterChangeSettingsError({ t }: { t: TFn }) {
  return (
    <section className={panel} aria-labelledby="roster-change-settings">
      <h2 id="roster-change-settings" className="text-lg font-extrabold">{t("title")}</h2>
      <p className="rounded-[var(--radius-control)] border border-red-400 px-3 py-2 text-sm font-bold" role="alert">{t("loadFailed")}</p>
    </section>
  );
}

export function RosterChangeSettingsPanel({ eventId, settings, result, error, t }: Props) {
  const resultKey = result && KNOWN_RESULTS.has(result) ? result : null;
  const errorKey = error ? (KNOWN_ERRORS.has(error) ? error : "unknown") : null;

  return (
    <section className={panel} aria-labelledby="roster-change-settings" data-roster-change-settings>
      <div>
        <h2 id="roster-change-settings" className="text-lg font-extrabold">{t("title")}</h2>
        <p className={`mt-1 ${muted}`}>{t("description")}</p>
      </div>

      {resultKey ? <p className="rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 py-2 text-sm font-bold" role="status">{t(`result.${resultKey}`)}</p> : null}
      {errorKey ? <p className="rounded-[var(--radius-control)] border border-red-400 px-3 py-2 text-sm font-bold" role="alert">{t(`error.${errorKey}`)}</p> : null}

      <form action={organizerSetRosterChangeLimitAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <label className="grid gap-1 text-sm font-bold">
          {t("limitLabel")}
          <input
            className={`${field} w-28`}
            type="number"
            name="limit"
            min={0}
            max={settings.maxLimit}
            step={1}
            defaultValue={settings.limit}
            disabled={!settings.formatSupported}
          />
        </label>
        <button type="submit" className={control} disabled={!settings.formatSupported}>{t("save")}</button>
      </form>
      <p className={muted}>{settings.formatSupported ? t("limitHelp") : t("unsupported")}</p>
      <p className="text-sm font-bold">{t(`window.${settings.window}`)}</p>

      <div className="grid gap-3">
        <h3 className="text-base font-extrabold">{t("pendingTitle")}</h3>
        {settings.pending.length === 0 ? (
          <p className={muted}>{t("noPending")}</p>
        ) : (
          <ul className="grid gap-3">
            {settings.pending.map((item) => (
              <PendingRequest key={item.id} item={item} eventId={eventId} limit={settings.limit} t={t} />
            ))}
          </ul>
        )}
      </div>

      {settings.recent.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-base font-extrabold">{t("recentTitle")}</h3>
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-control)] border border-[var(--color-border)]">
            {settings.recent.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span className="break-words">
                  {item.teamName} · {item.outgoing?.nickname ?? "-"} → {item.incoming?.nickname ?? "-"}
                </span>
                <span className="font-bold">
                  {t(`status.${item.status}`)}
                  {item.decisionNote ? <span className={`ml-2 font-normal ${muted}`}>{item.decisionNote}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
