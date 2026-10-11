import * as React from "react";

import {
  captainCancelRosterChangeAction,
  captainRequestRosterChangeAction,
} from "@/lib/actions/captain-roster-change-actions";
import { SubmitButton } from "@/components/submit-button";
import type { RosterChangeHistoryItem, RosterChangeOverview } from "@/lib/platform/roster-change-requests";
import type { Player, Team } from "@/lib/platform/types";

type TFn = (key: string, values?: Record<string, string | number>) => string;

type Props = {
  team: Team;
  /** Players currently on the roster. */
  players: Player[];
  positionOptions: string[];
  overview: RosterChangeOverview;
  t: TFn;
};

const inputClass = "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const labelClass = "grid gap-1.5 text-sm font-medium text-slate-700";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";
const quietButton = "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

function describe(item: RosterChangeHistoryItem, t: TFn): string {
  const out = item.outgoingName ?? "-";
  const incoming = item.incomingName ?? "-";
  if (item.kind === "add") return t("rosterChange.pendingAdd", { incoming });
  if (item.kind === "remove") return t("rosterChange.pendingRemove", { out });
  return t("rosterChange.pendingSwap", { out, incoming });
}

export function RosterChangePanel({ team, players, positionOptions, overview, t }: Props) {
  if (overview.window === "free") return null;

  const canRequest = overview.window === "limited" && overview.remaining > 0 && !overview.pending;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby={`roster-change-${team.id}`}>
      <div>
        <h3 id={`roster-change-${team.id}`} className="text-base font-semibold text-slate-950">{t("rosterChange.title")}</h3>
        <p className="mt-1 text-sm text-slate-600">
          {overview.window === "locked" ? t("rosterChange.lockedNotice") : t("rosterChange.limitedNotice")}
        </p>
        {overview.window === "limited" ? (
          <p className="mt-1 text-sm font-medium text-slate-800">
            {overview.remaining > 0 || overview.pending
              ? t("rosterChange.allowance", { remaining: overview.remaining, limit: overview.limit })
              : t("rosterChange.allowanceUsedUp")}
          </p>
        ) : null}
      </div>

      {overview.pending ? (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-900">{t("rosterChange.pendingTitle")}</p>
            <p className="text-sm text-amber-800">{describe(overview.pending, t)}</p>
          </div>
          <form action={captainCancelRosterChangeAction}>
            <input type="hidden" name="requestId" value={overview.pending.id} />
            <SubmitButton className={quietButton}>{t("rosterChange.cancel")}</SubmitButton>
          </form>
        </div>
      ) : null}

      {canRequest ? (
        <form action={captainRequestRosterChangeAction} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="teamId" value={team.id} />
          <h4 className="text-sm font-semibold text-slate-950">{t("rosterChange.formTitle")}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              {t("rosterChange.kind")}
              <select className={inputClass} name="kind" defaultValue="swap">
                <option value="swap">{t("rosterChange.kindSwap")}</option>
                <option value="add">{t("rosterChange.kindAdd")}</option>
                <option value="remove">{t("rosterChange.kindRemove")}</option>
              </select>
            </label>
            <label className={labelClass}>
              {t("rosterChange.leaving")}
              <select className={inputClass} name="outPlayerId" defaultValue="">
                <option value="">{t("rosterChange.chooseLeaving")}</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>{player.nickname} ({player.displayName})</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              {t("uid")}
              <input className={inputClass} name="displayName" placeholder={t("uidPlaceholder")} maxLength={40} />
            </label>
            <label className={labelClass}>
              {t("ign")}
              <input className={inputClass} name="nickname" placeholder={t("ignPlaceholder")} maxLength={40} />
            </label>
            <label className={labelClass}>
              {t("position")}
              <select className={inputClass} name="position" defaultValue="">
                <option value="">{t("positionOptionalChoice")}</option>
                {positionOptions.map((position) => (
                  <option key={position} value={position}>{position}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">{t("rosterChange.returnHint")}</p>
          <div>
            <SubmitButton className={primaryButton}>{t("rosterChange.submit")}</SubmitButton>
          </div>
        </form>
      ) : null}

      {overview.history.length > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-950">{t("rosterChange.historyTitle")}</h4>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {overview.history.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-slate-700">{describe(item, t)}</span>
                <span className="text-xs font-semibold text-slate-500">
                  {t(`rosterChange.status.${item.status}`)}
                  {item.decisionNote ? <span className="ml-2 font-normal text-slate-600">{item.decisionNote}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
