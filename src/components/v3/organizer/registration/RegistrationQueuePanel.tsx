"use client";
import React, { useState } from "react";
import { useTranslations } from "next-intl";
import type { RegistrationRecordPage } from "@/lib/registration/records";
import type { RegistrationImportEventContext } from "@/lib/imports/repository";
import { positionLabel } from "@/lib/solo/labels";
import { control, muted, panel, Filters, Pagination, WorkspaceDialog, registrationHref, type RegistrationQuery } from "./shared";
export type RosterTeam = RegistrationImportEventContext["teams"][number];
const SOLO_PAYMENT_STATUSES = ["pending_payment", "pending_review", "rejected"];
const TEAM_COLUMNS = ["team", "captain", "roster", "status", "source", "actions"] as const;
const SOLO_COLUMNS = ["player", "uid", "position", "status", "source", "actions"] as const;
export function RegistrationQueuePanel({ locale, eventId, query, queue, teams, participants = false, solo = false }: { locale: "id" | "en"; eventId: string; query: RegistrationQuery; queue: RegistrationRecordPage; teams: RosterTeam[]; participants?: boolean; solo?: boolean }) {
 const t = useTranslations("registrationWorkspace"); const [selected, setSelected] = useState<RosterTeam | null>(null);
 return <section className={panel}><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="mb-4 text-lg font-extrabold">{t(participants ? "participants" : solo ? "solo.queueTitle" : "queueTitle")}</h2><Filters {...{ locale, eventId, query, participants, solo }} />
 {queue.items.length ? <div className="mt-5 max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{t(solo ? "solo.queueTitle" : "queueTitle")}</caption><thead className={muted}><tr>{(solo ? SOLO_COLUMNS : TEAM_COLUMNS).map(key => <th scope="col" className="whitespace-nowrap border-b border-[var(--color-border)] p-3" key={key}>{t(["player", "uid", "position"].includes(key) ? `solo.${key}` : key)}</th>)}</tr></thead><tbody>{queue.items.map(item => <tr key={item.id}>
 {item.solo ? <>
 <td className="p-3"><strong className="block min-w-28 break-words">{item.teamName}</strong><span className="mt-1 inline-block rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs font-bold">{t("solo.badge")}</span></td>
 <td className="p-3 break-all">{item.captainName}</td>
 <td className="p-3"><span className="block">{positionLabel(item.teamTag, locale)}</span>{item.solo.secondaryPosition && <span className={muted}>{t("solo.backupPosition", { position: positionLabel(item.solo.secondaryPosition, locale) })}</span>}</td>
 </> : <>
 <td className="p-3"><strong className="block min-w-28 break-words">{item.teamName}</strong><span className={muted}>{item.teamTag}</span></td>
 <td className="p-3"><span className="block">{item.captainName}</span>{item.captainContact && <span className={muted}>{item.captainContact}</span>}</td>
 <td className="p-3">{item.rosterCount}</td>
 </>}<td className="p-3"><span className="inline-block rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-bold">{t(`statuses.${item.status}`)}</span></td><td className="p-3">{t(`sources.${item.source}`)}</td>
 <td className="p-3">{item.solo ? (!participants && SOLO_PAYMENT_STATUSES.includes(item.status) && <a className={control} href={registrationHref(locale, eventId, query, { view: "payments", q: item.teamName, source: "", status: "", page: 1 })}>{t("reviewPayment")}</a>) : teams.some(team => team.id === item.teamId) ? <button type="button" data-roster={item.teamId} className={control} onClick={() => setSelected(teams.find(team => team.id === item.teamId)!)}>{t("reviewRoster")}</button> : !participants && <a className={control} href={registrationHref(locale, eventId, query, { view: "payments", q: item.teamName, source: "", status: "", page: 1 })}>{t("reviewPayment")}</a>}</td>
 </tr>)}</tbody></table></div> : <p className={muted + " py-8"}>{t(solo ? "solo.emptyQueue" : "emptyQueue")}</p>}
 <Pagination {...{ locale, eventId, query, participants }} page={queue.page} totalPages={queue.totalPages} />
 {selected && <WorkspaceDialog title={selected.name} onClose={() => setSelected(null)}><p className={muted}>{t("captain")}: {selected.captainName} · {selected.captainContact}</p><ul className="mt-4 grid gap-3">{selected.players.map((player, index) => <li key={index} className="flex flex-wrap justify-between gap-2 border-b border-[var(--color-border)] py-3"><strong>{player.nickname}</strong><span>{player.displayName}</span><span className={muted}>{["Captain", "Unassigned"].includes(player.position) ? t(player.position === "Captain" ? "captain" : "unassigned") : player.position}</span></li>)}</ul></WorkspaceDialog>}
 </section>;
}
