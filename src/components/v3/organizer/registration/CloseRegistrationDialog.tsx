"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";

import { closeSoloRegistrationAction, type SoloOrganizerResult } from "@/lib/actions/solo-organizer-actions";
import type { CloseSoloPreview } from "@/lib/solo/draw-types";

import { control, muted, primary, WorkspaceDialog } from "./shared";

type Props = {
  eventId: string;
  preview: CloseSoloPreview;
  paymentsHref: string;
  onClose: () => void;
  onResult: (result: SoloOrganizerResult) => void;
};

/**
 * Asks the organizer to confirm closing registration. It lists what still blocks it, how many queued
 * players are released, and each approved player who will not get a team.
 */
export function CloseRegistrationDialog({ eventId, preview, paymentsHref, onClose, onResult }: Props) {
  const t = useTranslations("registrationWorkspace");
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const blocked = preview.pendingBlockers.length > 0;
  const allConfirmed = preview.willBeUnplaced.every((player) => confirmed.has(player.id));

  const toggle = (id: string) => setConfirmed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function submit() {
    if (blocked || !allConfirmed || busy) return;
    setBusy(true);
    const data = new FormData();
    data.set("eventId", eventId);
    data.set("expectedVersion", String(preview.competitionVersion));
    for (const id of confirmed) data.append("confirmRefundId", id);
    try {
      onResult(await closeSoloRegistrationAction(data));
    } catch {
      onResult({ status: "failed", message: t("operationFailed") });
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <WorkspaceDialog title={t("solo.draw.close.title")} onClose={onClose}>
      <div className="grid gap-4">
        <p className={muted}>{t("solo.draw.close.intro")}</p>
        {blocked && (
          <div role="alert" className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-3 text-sm">
            <p>{t("solo.draw.close.blockers", { count: preview.pendingBlockers.length })}</p>
            <a className="miracle-focus-ring mt-2 inline-block font-semibold text-[var(--color-brand-cyan)]" href={paymentsHref}>
              {t("solo.draw.close.blockersLink")}
            </a>
          </div>
        )}
        {preview.queuedCount > 0 && <p className={muted}>{t("solo.draw.close.queue", { count: preview.queuedCount })}</p>}
        {preview.willBeUnplaced.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="font-bold">{t("solo.draw.close.unplacedTitle")}</legend>
            <p className={muted}>{t(preview.feeRequired ? "solo.draw.close.unplacedHelp" : "solo.draw.close.unplacedHelpFree")}</p>
            {preview.willBeUnplaced.map((player) => (
              <label key={player.id} className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] py-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={confirmed.has(player.id)}
                  onChange={() => toggle(player.id)}
                />
                <span className="min-w-0 break-words"><strong>{player.ign}</strong> · {player.uid}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={control} onClick={onClose}>{t("solo.draw.close.cancel")}</button>
          <button type="button" data-confirm-close className={primary} disabled={blocked || !allConfirmed || busy} onClick={submit}>
            {busy ? t("solo.draw.close.working") : t("solo.draw.close.confirm")}
          </button>
        </div>
      </div>
    </WorkspaceDialog>
  );
}
