import React from "react";
import { useTranslations } from "next-intl";

import type { CloseSoloPreview, SoloDrawView } from "@/lib/solo/draw-types";
import { positionLabel } from "@/lib/solo/labels";
import type { SoloEventSummary } from "@/lib/solo/organizer-read";
import type { SoloWarning } from "@/lib/solo/types";

import { control, muted, panel } from "./shared";

const heading = { fontFamily: "var(--font-miracle-v3)" } as const;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className={muted}>{label}</dt>
      <dd className="mt-1 text-xl font-extrabold">{value}</dd>
    </div>
  );
}

/** Each warning of a plan or a draw, in words. */
export function WarningList({ warnings, summary, locale }: { warnings: readonly SoloWarning[]; summary: SoloEventSummary; locale: "id" | "en" }) {
  const t = useTranslations("registrationWorkspace");
  if (warnings.length === 0) return null;
  const position = positionLabel(summary.requiredPosition, locale);
  return (
    <ul className="grid gap-2 text-sm">
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${index}`} className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-3">
          {t(`solo.draw.warnings.${warning.code}`, { position, ...warning.detail })}
        </li>
      ))}
    </ul>
  );
}

/** How many players are accepted and how many teams they make. `showWarnings` is off once a draw lists its own. */
export function ReadyPanel({ locale, summary, preview, showWarnings }: {
  locale: "id" | "en";
  summary: SoloEventSummary;
  preview: CloseSoloPreview;
  showWarnings: boolean;
}) {
  const t = useTranslations("registrationWorkspace");
  const position = positionLabel(summary.requiredPosition, locale);
  const { plan } = preview;
  const emergency = plan.emergencyUsedRegistrationIds.length;
  return (
    <section className={panel} aria-labelledby="solo-ready-title">
      <h2 id="solo-ready-title" style={heading} className="mb-4 text-lg font-extrabold">{t("solo.draw.ready.title")}</h2>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label={t("solo.draw.ready.keepers", { position })} value={plan.keeperRegistrationIds.length - emergency} />
        <Stat label={t("solo.draw.ready.emergency", { position })} value={emergency} />
        <Stat label={t("solo.draw.ready.field")} value={plan.fieldRegistrationIds.length} />
        <Stat label={t("solo.draw.ready.teams")} value={t("solo.draw.ready.teamsValue", { teams: plan.teamCount, cap: summary.participantCap })} />
        <Stat label={t("solo.draw.ready.unplaced")} value={preview.willBeUnplaced.length} />
      </dl>
      {showWarnings && <div className="mt-4"><WarningList warnings={plan.warnings} summary={summary} locale={locale} /></div>}
    </section>
  );
}

/** Players who are out of every team, and for a paid event whether each has been paid back. */
export function RefundList({ draw, preview, feeRequired, busy, onMark }: {
  draw: SoloDrawView | null;
  preview: CloseSoloPreview | null;
  feeRequired: boolean;
  busy: boolean;
  onMark: (registrationId: string) => void;
}) {
  const t = useTranslations("registrationWorkspace");
  const rows = draw
    ? draw.unplaced.map((player) => ({ id: player.registrationId, ign: player.ign, uid: player.uid, needsRefund: player.needsRefund, refunded: player.refundedAt !== null }))
    : (preview?.willBeUnplaced ?? []).map((player) => ({ id: player.id, ign: player.ign, uid: player.uid, needsRefund: false, refunded: false }));
  return (
    <section className={panel} aria-labelledby="solo-refund-title">
      <h2 id="solo-refund-title" style={heading} className="mb-3 text-lg font-extrabold">{t("solo.draw.refund.title")}</h2>
      {rows.length === 0 && <p className={muted}>{t("solo.draw.refund.empty")}</p>}
      {rows.length > 0 && !feeRequired && <p className={muted + " mb-2"}>{t("solo.draw.refund.free")}</p>}
      <ul className="grid gap-1">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] py-2 text-sm">
            <span className="min-w-0 break-words"><strong>{row.ign}</strong> · {row.uid}</span>
            {feeRequired && row.refunded && <span className={muted}>{t("solo.draw.refund.done")}</span>}
            {feeRequired && row.needsRefund && (
              <button type="button" data-refund={row.id} className={control} disabled={busy} onClick={() => onMark(row.id)}>
                {t("solo.draw.refund.mark")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shown once the teams are locked, with the way on to the competition. */
export function LockedNotice({ locale, eventId, draw }: { locale: "id" | "en"; eventId: string; draw: SoloDrawView }) {
  const t = useTranslations("registrationWorkspace");
  return (
    <section className={panel} role="status">
      <h2 style={heading} className="text-lg font-extrabold">{t("solo.draw.locked.title")}</h2>
      <p className={muted + " mt-2"}>{t("solo.draw.locked.body", { teams: draw.teamCount, version: draw.version })}</p>
      <a className={control + " mt-3"} href={`/${locale}/organizer/events/${encodeURIComponent(eventId)}/competition`}>{t("solo.draw.locked.link")}</a>
    </section>
  );
}
