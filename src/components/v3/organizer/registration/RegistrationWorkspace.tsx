"use client";
import React from "react";
import { useTranslations } from "next-intl";
import { ClipboardList, CreditCard, FileSpreadsheet, QrCode } from "lucide-react";
import type { EventPaymentManagerSettings, PaymentReviewEntry, RegistrationImportHistoryEntry } from "@/lib/platform/repository";
import type { RegistrationRecordPage } from "@/lib/registration/records";
import { RegistrationQueuePanel, type RosterTeam } from "./RegistrationQueuePanel";
import { RegistrationImportPanel } from "./RegistrationImportPanel";
import { PaymentReviewPanel } from "./PaymentReviewPanel";
import { EventQrisPanel } from "./EventQrisPanel";
import { control, muted, panel, registrationHref, type RegistrationQuery } from "./shared";
export type RegistrationWorkspaceProps = {
 locale: "id" | "en"; eventId: string; query: RegistrationQuery; capacity: number; acceptedCount: number;
 queue?: RegistrationRecordPage; teams?: RosterTeam[]; history?: RegistrationImportHistoryEntry[]; payments?: PaymentReviewEntry[]; qris?: EventPaymentManagerSettings; error?: boolean; participants?: boolean;
};
export function RegistrationWorkspace(props: RegistrationWorkspaceProps) {
 const t = useTranslations("registrationWorkspace"); const { locale, eventId, query, capacity, acceptedCount, participants } = props;
 const returnTo = registrationHref(locale, eventId, query);
 return <div key={eventId} className="miracle-v3-feedback grid min-w-0 gap-5 [&_h1]:font-[family-name:var(--font-miracle-v3)] [&_h2]:font-[family-name:var(--font-miracle-v3)] [&_h3]:font-[family-name:var(--font-miracle-v3)]" style={{ fontFamily: "var(--font-miracle-v3)" }}>
  <header className="flex min-w-0 flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-[var(--color-brand-cyan)]">{t("eventOperations")}</p><h1 style={{ fontFamily: "var(--font-miracle-v3)" }} className="break-words text-2xl font-extrabold sm:text-3xl">{t(participants ? "participants" : "title")}</h1><p className={muted + " mt-3 max-w-3xl"}>{t(participants ? "participantsDescription" : "description")}</p></div>{!props.error && <div className={panel + " py-3"}><p className={muted}>{t("acceptedCapacity")}</p><p className="mt-1 text-xl font-extrabold text-[var(--color-accent-cream-foreground)]">{acceptedCount} / {capacity}</p></div>}</header>
  {!participants && <nav aria-label={t("views")} className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">{([["queue", ClipboardList], ["import", FileSpreadsheet], ["payments", CreditCard], ["qris", QrCode]] as const).map(([view, Icon]) => <a key={view} data-view={view} href={registrationHref(locale, eventId, query, { view, page: 1 })} aria-current={query.view === view ? "page" : undefined} className={control + (query.view === view ? " border-[var(--color-brand-violet)] bg-[var(--color-surface-selected)]" : "")}><Icon aria-hidden="true" className="size-4 shrink-0" /><span>{t(`viewsLabels.${view}`)}</span></a>)}</nav>}
  {props.error ? <div role="alert" className={panel}><h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="font-bold">{t("loadError")}</h2><p className={muted}>{t("loadErrorHelp")}</p><a className={control + " mt-3"} href={participants ? registrationHref(locale, eventId, query, {}, true) : returnTo}>{t("reload")}</a></div> : <>
  {(participants || query.view === "queue") && props.queue && <RegistrationQueuePanel {...{ locale, eventId, query, participants }} queue={props.queue} teams={props.teams ?? []} />}
  {!participants && query.view === "import" && <RegistrationImportPanel {...{ locale, eventId, returnTo }} history={props.history ?? []} />}
  {!participants && query.view === "payments" && <PaymentReviewPanel {...{ locale, eventId, query, returnTo }} payments={props.payments ?? []} />}
  {!participants && query.view === "qris" && props.qris && <EventQrisPanel key={`${eventId}:${props.qris.version}`} {...{ locale, eventId, returnTo }} settings={props.qris} />}
  </>}
 </div>;
}
