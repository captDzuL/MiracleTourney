// Tells the captain which team data is still missing and until when, with a form for the WhatsApp number.

import { Link } from "@/i18n/navigation";
import { inputClass, labelClass, Notice, primaryButton } from "@/app/captain/dashboard/shared";
import type { TFn } from "@/app/captain/dashboard/shared";
import { captainUpdateContactAction } from "@/lib/actions/registration-completion-actions";
import { formatCompletionDeadline } from "@/lib/registration/completion";
import type { CaptainCompletionNotice } from "@/lib/registration/completion-repository";

function deadlineText(notice: CaptainCompletionNotice, t: TFn) {
  if (notice.state === "overdue") return t("completionOverdue");
  if (notice.state === "incomplete" || !notice.deadlineAt) return t("completionWaiting");
  return t("completionDeadline", { date: formatCompletionDeadline(new Date(notice.deadlineAt)) });
}

export function CompletionNotices({ notices, t }: { notices: CaptainCompletionNotice[]; t: TFn }) {
  if (!notices.length) return null;
  return (
    <div className="grid gap-3" data-testid="completion-notices">
      {notices.map((notice) => notice.suspended ? (
        <Notice key={notice.teamId} tone="danger">
          {t("completionSuspended", { team: notice.teamName, event: notice.eventName })}
        </Notice>
      ) : (
        <Notice key={notice.teamId} tone={notice.state === "overdue" ? "danger" : "warning"}>
          <p className="font-semibold">{t("completionTitle", { team: notice.teamName, event: notice.eventName })}</p>
          <ul className="mt-2 list-disc pl-5 font-normal">
            {notice.missingContact ? <li>{t("completionMissingContact")}</li> : null}
            {notice.missingPlayers > 0 ? <li>{t("completionMissingPlayers", { count: notice.missingPlayers })}</li> : null}
          </ul>
          <p className="mt-2 font-normal">{deadlineText(notice, t)}</p>
          {notice.missingContact ? (
            <form action={captainUpdateContactAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="teamId" value={notice.teamId} />
              <label className={`${labelClass} min-w-56 flex-1 text-inherit`}>
                {t("captainContact")}
                <input className={inputClass} name="captainContact" placeholder={t("captainContactPlaceholder")} inputMode="tel" minLength={6} required />
              </label>
              <button type="submit" className={primaryButton}>{t("completionSaveContact")}</button>
            </form>
          ) : null}
          {notice.missingPlayers > 0 ? (
            <p className="mt-3">
              <Link href="/captain?tab=roster" className="font-semibold underline underline-offset-4">{t("completionFillRoster")}</Link>
            </p>
          ) : null}
        </Notice>
      ))}
    </div>
  );
}
