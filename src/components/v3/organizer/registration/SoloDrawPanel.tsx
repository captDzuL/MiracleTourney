"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import {
  createSoloDrawAction,
  lockSoloDrawAction,
  markSoloRefundedAction,
  swapSoloPlayersAction,
  type SoloOrganizerResult,
} from "@/lib/actions/solo-organizer-actions";
import type { CloseSoloPreview } from "@/lib/solo/draw-types";
import type { SoloDrawPanelData, SoloEventSummary } from "@/lib/solo/organizer-read";

import { CloseRegistrationDialog } from "./CloseRegistrationDialog";
import { SoloConfirmDialog } from "./SoloConfirmDialog";
import { SoloDrawResult } from "./SoloDrawResult";
import { LockedNotice, ReadyPanel, RefundList } from "./SoloDrawSections";
import { control, muted, panel, primary, Feedback } from "./shared";

type Props = {
  locale: "id" | "en";
  eventId: string;
  summary: SoloEventSummary;
  data: SoloDrawPanelData;
  paymentsHref: string;
};

type Dialog = "close" | "lock" | "redraw" | null;

const MIN_TEAMS = 2;
const MAX_PICKED = 2;

/** Why the draw button is off, or null when it can be used. */
function drawBlocker(summary: SoloEventSummary, locked: boolean, preview: CloseSoloPreview | null): string | null {
  if (locked) return "solo.draw.run.locked";
  if (summary.status === "Published") return "solo.draw.run.closeFirst";
  if (summary.status !== "Registration Closed") return "solo.draw.run.started";
  if ((preview?.plan.teamCount ?? 0) < MIN_TEAMS) return "solo.draw.run.tooFew";
  return null;
}

/** Keeps the two newest picks, so a third click replaces the oldest instead of being ignored. */
const pick = (current: readonly string[], id: string) => {
  if (current.includes(id)) return current.filter((entry) => entry !== id);
  return current.length < MAX_PICKED ? [...current, id] : [current[1], id];
};

function formOf(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

/** The draw tab of a solo event: ready check, close, draw, swap, lock and refunds. */
export function SoloDrawPanel({ locale, eventId, summary, data, paymentsHref }: Props) {
  const t = useTranslations("registrationWorkspace");
  const router = useRouter();
  const { draw, preview } = data;
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>({ message: "" });

  const locked = summary.teamsLocked || draw?.status === "locked";
  const editable = !locked && draw?.status === "draft" && summary.status === "Registration Closed";
  const blocker = drawBlocker(summary, locked, preview);
  /** What a swap or a lock sends back, so a screen that is out of date is told so instead of acting. */
  const seen = draw ? draw.updatedAt.toISOString() : "";

  function report(result: SoloOrganizerResult) {
    setFeedback({ message: result.message, error: result.status !== "ok" });
    // A stale screen (conflict) and a success both show something new; only a plain refusal leaves the page as it is.
    if (result.status !== "failed") {
      setSelected([]);
      router.refresh();
    }
  }

  async function perform(call: () => Promise<SoloOrganizerResult>) {
    if (busy) return;
    setBusy(true);
    setFeedback({ message: "" });
    try {
      report(await call());
    } catch {
      setFeedback({ message: t("operationFailed"), error: true });
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  const drawTeams = () => perform(() => createSoloDrawAction(formOf({ eventId })));

  return (
    <div className="grid min-w-0 gap-4">
      <section className={panel}>
        <h2 style={{ fontFamily: "var(--font-miracle-v3)" }} className="text-lg font-extrabold">{t("solo.draw.title")}</h2>
        <p className={muted + " mt-2 max-w-3xl"}>{t("solo.draw.description")}</p>
      </section>

      {locked && draw && <LockedNotice locale={locale} eventId={eventId} draw={draw} />}
      {!locked && preview && <ReadyPanel locale={locale} summary={summary} preview={preview} showWarnings={draw?.status !== "draft"} />}

      {!locked && (
        <section className={panel + " grid gap-3"}>
          <div className="flex flex-wrap gap-2">
            {summary.status === "Published" && preview && (
              <button type="button" data-close-registration className={primary} disabled={busy} onClick={() => setDialog("close")}>
                {t("solo.draw.close.button")}
              </button>
            )}
            <button
              type="button"
              data-draw
              className={summary.status === "Published" ? control : primary}
              disabled={busy || blocker !== null}
              aria-describedby={blocker ? "solo-draw-blocker" : undefined}
              onClick={() => (draw?.status === "draft" ? setDialog("redraw") : drawTeams())}
            >
              {busy ? t("solo.draw.run.working") : draw ? t("solo.draw.run.again") : t("solo.draw.run.button")}
            </button>
          </div>
          {blocker && <p id="solo-draw-blocker" className={muted}>{t(blocker)}</p>}
        </section>
      )}

      {draw && draw.status !== "superseded" && (
        <SoloDrawResult
          locale={locale}
          summary={summary}
          draw={draw}
          editable={editable}
          selected={selected}
          busy={busy}
          onToggle={(id) => setSelected((current) => pick(current, id))}
          onSwap={() => perform(() => swapSoloPlayersAction(formOf({ drawId: draw.id, a: selected[0], b: selected[1], expectedUpdatedAt: seen })))}
          onLock={() => setDialog("lock")}
        />
      )}

      {(draw || preview) && (
        <RefundList
          draw={draw}
          preview={preview}
          feeRequired={summary.feeRequired}
          busy={busy}
          onMark={(registrationId) => perform(() => markSoloRefundedAction(formOf({ registrationId })))}
        />
      )}

      <Feedback {...feedback} />

      {dialog === "close" && preview && (
        <CloseRegistrationDialog eventId={eventId} preview={preview} paymentsHref={paymentsHref} onClose={() => setDialog(null)} onResult={report} />
      )}
      {dialog === "lock" && draw && (
        <SoloConfirmDialog
          title={t("solo.draw.lock.title")}
          body={t("solo.draw.lock.body")}
          confirmLabel={t("solo.draw.lock.confirm")}
          workingLabel={t("solo.draw.lock.working")}
          busy={busy}
          confirmAttribute="data-confirm-lock"
          onConfirm={() => perform(() => lockSoloDrawAction(formOf({ drawId: draw.id, expectedUpdatedAt: seen })))}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "redraw" && (
        <SoloConfirmDialog
          title={t("solo.draw.redraw.title")}
          body={t("solo.draw.redraw.body")}
          confirmLabel={t("solo.draw.redraw.confirm")}
          workingLabel={t("solo.draw.run.working")}
          busy={busy}
          confirmAttribute="data-confirm-redraw"
          onConfirm={drawTeams}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
