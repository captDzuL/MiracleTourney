"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { extendTeamDeadlineAction, restoreTeamAction, suspendTeamAction, type CompletionActionResult } from "@/lib/actions/registration-completion-actions";
import type { RegistrationRecord } from "@/lib/registration/records";
import { control, muted } from "./shared";

type Props = Pick<RegistrationRecord, "completion" | "status"> & { eventId: string; teamId: string };

/** Fixed zone and locale, so the server and the browser print the same text. */
function formatDeadline(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function TeamCompletionCell({ completion, status, eventId, teamId, locale }: Props & { locale: string }) {
  const t = useTranslations("registrationWorkspace");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function run(action: (data: FormData) => Promise<CompletionActionResult>) {
    if (busy) return;
    setBusy(true); setError("");
    const data = new FormData(); data.set("eventId", eventId); data.set("teamId", teamId);
    try {
      const result = await action(data);
      if (result.status === "done") { setConfirming(false); router.refresh(); } else setError(result.message);
    } catch { setError(t("operationFailed")); } finally { setBusy(false); }
  }

  if (status === "suspended") {
    return <div className="grid min-w-40 gap-2"><span className={muted}>{t("suspendedNote")}</span>
      <button type="button" className={control} disabled={busy} onClick={() => run(restoreTeamAction)}>{t("restoreTeam")}</button>
      {error && <p role="alert" className="text-sm text-[var(--color-feedback-error)]">{error}</p>}</div>;
  }
  if (!completion) return <span className={muted}>-</span>;

  return <div className="grid min-w-40 gap-2" data-completion={teamId}>
    <ul className="grid gap-1 text-sm">
      {completion.missingContact && <li>{t("missingContact")}</li>}
      {completion.missingPlayers > 0 && <li>{t("missingPlayers", { count: completion.missingPlayers })}</li>}
    </ul>
    <p className={muted + (completion.state === "overdue" ? " font-bold" : "")}>
      {completion.state === "incomplete" || !completion.deadlineAt ? t("completionWaiting")
        : completion.state === "overdue" ? `${t("completionOverdue")} · ${formatDeadline(completion.deadlineAt, locale)}`
        : t("completionDeadline", { date: formatDeadline(completion.deadlineAt, locale) })}
    </p>
    {confirming ? <div className="grid gap-2" role="group" aria-label={t("suspendQuestion")}>
      <p className="text-sm">{t("suspendQuestion")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={control} disabled={busy} data-confirm-suspend={teamId} onClick={() => run(suspendTeamAction)}>{t("suspendConfirm")}</button>
        <button type="button" className={control} disabled={busy} onClick={() => setConfirming(false)}>{t("keepTeam")}</button>
      </div></div>
      : <div className="flex flex-wrap gap-2">
        {completion.state === "overdue" && <button type="button" className={control} disabled={busy} data-suspend={teamId} onClick={() => setConfirming(true)}>{t("suspend")}</button>}
        {completion.state !== "incomplete" && <button type="button" className={control} disabled={busy} data-extend={teamId} onClick={() => run(extendTeamDeadlineAction)}>{t("extendDeadline")}</button>}
      </div>}
    {error && <p role="alert" className="text-sm text-[var(--color-feedback-error)]">{error}</p>}
  </div>;
}
