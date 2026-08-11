import { getTranslations } from "next-intl/server";

import { redirectToActiveLocale } from "@/i18n/redirect";
import { captainSubmitStatsAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { getStatKeysForMode } from "@/lib/platform/config";
import { getCompletedMatchesForCaptain, getPlayersForTeam } from "@/lib/platform/repository";
import { Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CaptainStatsPage() {
  const user = await requireRole("captain");
  if (!user) {
    return redirectToActiveLocale("/login");
  }

  const t = await getTranslations("captainStats");
  const matchRows = await getCompletedMatchesForCaptain(user.id);

  const teamIds = [...new Set(matchRows.map((r) => r.teamId))];
  const playersByTeam = new Map(
    await Promise.all(teamIds.map(async (id) => [id, await getPlayersForTeam(id)] as const)),
  );

  if (matchRows.length === 0) {
    return (
      <Section title={t("title")} description={t("noMatches")}>
        <p className="text-sm text-slate-400">{t("noMatchesDesc")}</p>
      </Section>
    );
  }

  const statusClass: Record<string, { label: string; class: string }> = {
    pending: { label: t("pendingReview"), class: "bg-amber-100 text-amber-700" },
    approved: { label: t("approved"), class: "bg-emerald-100 text-emerald-700" },
    rejected: { label: t("rejected"), class: "bg-red-100 text-red-700" },
  };

  return (
    <div className="space-y-6">
      <Section title={t("title")} description={t("description")}>
        <div className="space-y-4">
          {matchRows.map((row) => {
            const statKeys = getStatKeysForMode(row.gameModeId, row.gameId);
            const players = playersByTeam.get(row.teamId) ?? [];
            const sub = row.submission;
            const canSubmit = !sub || sub.status === "rejected";

            return (
              <details
                key={`${row.matchId}::${row.teamId}`}
                className="rounded-2xl border border-slate-200 bg-white"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {row.matchLabel}
                      {row.slot != null ? ` · Match ${row.slot}` : ""}
                      {" — "}
                      <span className="text-slate-500">
                        {row.teamName} vs {row.opponentName}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {row.eventName} · Score: {row.homeScore}–{row.awayScore}
                    </p>
                    {sub?.status === "rejected" && sub.rejectionNote && (
                      <p className="mt-1 text-xs text-red-600">
                        {t("rejectedNote", { note: sub.rejectionNote })}
                      </p>
                    )}
                  </div>
                  {sub ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[sub.status]?.class}`}
                    >
                      {statusClass[sub.status]?.label}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                      {t("notSubmitted")}
                    </span>
                  )}
                </summary>

                {canSubmit && players.length > 0 && (
                  <form action={captainSubmitStatsAction} className="border-t border-slate-100 p-4">
                    <input type="hidden" name="matchId" value={row.matchId} />
                    <input type="hidden" name="teamId" value={row.teamId} />
                    <input type="hidden" name="eventId" value={row.eventId} />

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="py-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                              Player
                            </th>
                            {statKeys.map((k) => (
                              <th
                                key={k}
                                className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-widest text-slate-400"
                              >
                                {k}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {players.map((player) => (
                            <tr key={player.id} className="border-t border-slate-50">
                              <td className="py-2 pr-3">
                                <p className="font-medium text-slate-900">{player.displayName}</p>
                                <p className="text-xs text-slate-400">{player.position}</p>
                              </td>
                              {statKeys.map((k) => (
                                <td key={k} className="px-2 py-2">
                                  <input
                                    type="number"
                                    name={`stat_${player.id}_${k}`}
                                    min={0}
                                    defaultValue={sub?.stats?.[player.id]?.[k] ?? 0}
                                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4">
                      <button
                        type="submit"
                        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        {sub?.status === "rejected" ? t("resubmit") : t("submit")}
                      </button>
                    </div>
                  </form>
                )}

                {sub?.status === "approved" && (
                  <div className="border-t border-slate-100 p-4 text-sm text-emerald-600">
                    {t("statsApproved")}
                  </div>
                )}

                {!canSubmit && sub?.status === "pending" && (
                  <div className="border-t border-slate-100 p-4 text-sm text-amber-600">
                    {t("awaitingReview")}
                  </div>
                )}

                {players.length === 0 && canSubmit && (
                  <div className="border-t border-slate-100 p-4 text-sm text-slate-400">
                    {t("addPlayersFirst")}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
