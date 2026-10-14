import type { PlayerStage, RefundState } from "@/lib/player/dashboard-read";

import type { Tone } from "./styles";

export type Locale = "id" | "en";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** A time as people read it in Indonesia, in the language of the page. */
export function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date);
}

/** The key of the short label on a stage's badge. */
export function stageLabelKey(stage: PlayerStage): string {
  return `stage.${stage.kind}`;
}

export function stageTone(stage: PlayerStage): Tone {
  switch (stage.kind) {
    case "in_team":
      return "good";
    case "pay":
    case "rejected":
      return "action";
    case "review":
    case "waiting":
    case "queued":
      return "info";
    case "out_of_teams":
    case "lost":
      return stage.kind === "lost" && stage.why === "withdrawn" ? "neutral" : "bad";
  }
}

/** The refund sentence for a stage, or null when nothing was paid. */
export function refundText(t: Translate, refund: RefundState): string | null {
  return refund === "none" ? null : t(`stageText.refund.${refund}`);
}

/** What a stage means for the player, in one sentence. */
export function stageText(t: Translate, stage: PlayerStage, context: { locale: Locale; teamName: string | null }): string {
  switch (stage.kind) {
    case "queued":
      return stage.position === null ? t("stageText.queuedUnknown") : t("stageText.queued", { position: stage.position });
    case "pay":
      return stage.deadline ? t("stageText.pay", { deadline: formatDateTime(stage.deadline, context.locale) }) : t("stageText.payNoDeadline");
    case "review":
      return t("stageText.review");
    case "rejected": {
      const deadline = stage.deadline ? formatDateTime(stage.deadline, context.locale) : "";
      return stage.reason ? t("stageText.rejected", { reason: stage.reason, deadline }) : t("stageText.rejectedNoReason", { deadline });
    }
    case "waiting":
      return t("stageText.waiting");
    case "in_team":
      return t("stageText.in_team", { team: context.teamName ?? "" });
    case "out_of_teams":
      return t("stageText.out_of_teams");
    case "lost":
      return t(stage.why === "expired" ? "stageText.expired" : "stageText.withdrawn");
  }
}

/** Stages in which the sign-up page still has something for the player to do. */
export function hasOpenSignUp(stage: PlayerStage, eventStatus: string): boolean {
  if (eventStatus !== "Published") return false;
  return stage.kind === "queued" || stage.kind === "pay" || stage.kind === "review" || stage.kind === "rejected" || stage.kind === "waiting";
}

/** Whether a registration is still alive, as opposed to history. */
export function isActive(stage: PlayerStage): boolean {
  return stage.kind !== "lost";
}
