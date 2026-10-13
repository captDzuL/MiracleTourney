"use client";

import React from "react";
import { useTranslations } from "next-intl";

import { control, muted, primary, WorkspaceDialog } from "./shared";

type Props = {
  title: string;
  body: string;
  confirmLabel: string;
  workingLabel: string;
  busy: boolean;
  /** Lets a test or a script find the confirm button. */
  confirmAttribute: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A plain "are you sure" for a step that cannot be taken back, such as locking teams or drawing over a draft. */
export function SoloConfirmDialog({ title, body, confirmLabel, workingLabel, busy, confirmAttribute, onConfirm, onCancel }: Props) {
  const t = useTranslations("registrationWorkspace");
  return (
    <WorkspaceDialog title={title} onClose={onCancel}>
      <p className={muted}>{body}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className={control} onClick={onCancel}>{t("solo.draw.close.cancel")}</button>
        <button type="button" {...{ [confirmAttribute]: true }} className={primary} disabled={busy} onClick={onConfirm}>
          {busy ? workingLabel : confirmLabel}
        </button>
      </div>
    </WorkspaceDialog>
  );
}
