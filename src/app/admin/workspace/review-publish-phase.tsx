// Phase of the admin workspace: review and publish.
// Moved out of admin-workspace.tsx without changes (refactor Phase 4, 4a-admin).

import { PhaseSection, StatusChip, inputClass, labelClass, primaryButton, quietButton } from "@/app/admin/workspace/shared";
import type { AdminTranslator, CertificateItem, EventItem, PendingSubmissionItem } from "@/app/admin/workspace/shared";
import { IntrinsicImage } from "@/components/IntrinsicImage";
import { SubmitButton } from "@/components/submit-button";
import { Section } from "@/components/ui";
import { adminRegenerateCertificateAction } from "@/lib/actions/certificate-actions";
import { adminSetAccentColorAction, adminUploadCharacterArtAction } from "@/lib/actions/event-actions";
import { adminApproveStatAction, adminRejectStatAction } from "@/lib/actions/match-actions";
import { getGameForEvent } from "@/lib/platform/settings-repository";
import { Check, ImageUp, Palette, RefreshCw, X } from "lucide-react";

export function ReviewPublishPhase({
  certificatesByEvent,
  events,
  pendingCount,
  pendingSubmissions,
  t,
}: {
  certificatesByEvent: Map<string, CertificateItem>;
  events: EventItem[];
  pendingCount: number;
  pendingSubmissions: PendingSubmissionItem[];
  t: AdminTranslator;
}) {
  return (
    <PhaseSection
      action={<StatusChip tone={pendingCount > 0 ? "warning" : "success"}>{t("pendingReviews", { count: pendingCount })}</StatusChip>}
      description={t("reviewDescription")}
      title={t("reviewWorkspaceTitle")}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
        <Section
          title={`${t("statReviewTitle")}${pendingCount > 0 ? ` - ${pendingCount} ${t("pending")}` : ""}`}
          description={t("statReviewDescription")}
          className="rounded-xl shadow-none"
        >
          {pendingSubmissions.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noPendingSubmissions")}</p>
          ) : (
            <div className="grid gap-3">
              {pendingSubmissions.map((submission) => (
                <details key={submission.id} className="rounded-lg border border-slate-200 bg-slate-50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {submission.matchLabel} - {submission.teamName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {submission.eventName} - {submission.captainEmail} - {new Date(submission.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusChip tone="warning">{t("pending")}</StatusChip>
                  </summary>

                  <div className="border-t border-slate-200 bg-white p-4">
                    <div className="mb-4 overflow-x-auto">
                      <table className="w-full text-xs text-slate-700">
                        <thead>
                          <tr>
                            <th className="py-1 text-left font-semibold uppercase text-slate-500">{t("playerId")}</th>
                            <th className="px-2 py-1 text-left font-semibold uppercase text-slate-500">{t("statsLabel")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(submission.stats).map(([playerId, stats]) => (
                            <tr key={playerId} className="border-t border-slate-100">
                              <td className="mono py-1.5 pr-3 text-slate-500">{playerId.slice(0, 12)}...</td>
                              <td className="py-1.5">
                                {Object.entries(stats).map(([key, value]) => (
                                  <span key={key} className="mr-2 inline-block">
                                    <span className="text-slate-500">{key}:</span>{" "}
                                    <span className="text-slate-900">{value}</span>
                                  </span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <form action={adminApproveStatAction}>
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <SubmitButton className={primaryButton}>
                          <Check className="h-4 w-4" />
                          {t("approve")}
                        </SubmitButton>
                      </form>
                      <form action={adminRejectStatAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <input className={inputClass} name="rejectionNote" placeholder={t("rejectionNote")} />
                        <SubmitButton className={quietButton}>
                          <X className="h-4 w-4" />
                          {t("reject")}
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </Section>

        <Section title={t("certificateSettingsTitle")} description={t("certificateSettingsDescription")} className="rounded-xl shadow-none">
          <div className="space-y-4">
            {events.map((event) => {
              const cert = certificatesByEvent.get(event.id);
              const certFailed = cert?.status === "failed";
              const certReady = cert?.status === "ready" && Boolean(cert.imageUrl);
              return (
                <details key={event.id} className="rounded-lg border border-slate-200 bg-slate-50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{event.name}</p>
                      <p className="text-xs text-slate-500">{getGameForEvent(event).name} - {event.status}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusChip tone={certReady ? "success" : certFailed ? "danger" : "default"}>
                        {certReady ? t("certificateReady") : certFailed ? t("certificateFailed") : t("noCertificate")}
                      </StatusChip>
                      {event.accentColor ? (
                        <span className="inline-block h-5 w-5 rounded-full border border-slate-300" style={{ background: event.accentColor }} />
                      ) : null}
                    </div>
                  </summary>
                  <div className="grid gap-4 border-t border-slate-200 bg-white p-4">
                    <form action={adminUploadCharacterArtAction} className="grid gap-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <p className="text-xs font-semibold uppercase text-slate-500">{t("characterArt")}</p>
                      {event.characterArtUrl ? (
                        <IntrinsicImage src={event.characterArtUrl} alt="Character art preview" heightRem={6} constrainToParent={false} className="rounded-lg border border-slate-200 object-contain" />
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <input type="file" name="characterArt" accept="image/png,image/webp,image/jpeg" className={`${inputClass} flex-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`} />
                        <SubmitButton className={quietButton}>
                          <ImageUp className="h-4 w-4" />
                          {t("upload")}
                        </SubmitButton>
                      </div>
                    </form>
                    <form action={adminSetAccentColorAction} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <label className={labelClass}>
                        {t("accentColor")}
                        <input type="color" name="accentColor" defaultValue={event.accentColor ?? "#2563eb"} className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
                      </label>
                      <SubmitButton className={quietButton}>
                        <Palette className="h-4 w-4" />
                        {t("saveColor")}
                      </SubmitButton>
                    </form>
                    {certFailed ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <p className="mb-1 text-xs font-semibold text-rose-700">
                          {t("certificateLastError")}
                          {cert.attemptCount > 1 ? ` (${t("certificateAttempts", { count: cert.attemptCount })})` : null}
                        </p>
                        <p className="break-words text-xs text-rose-700">{cert.lastError ?? "-"}</p>
                      </div>
                    ) : null}
                    {certReady ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <p className="mb-1 text-xs font-semibold text-emerald-700">{t("championCertificate")}</p>
                        <a href={cert.imageUrl} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-emerald-700 underline">
                          {cert.imageUrl}
                        </a>
                      </div>
                    ) : null}
                    <form action={adminRegenerateCertificateAction} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <SubmitButton className={quietButton}>
                        <RefreshCw className="h-4 w-4" />
                        {t("certificateRegenerate")}
                      </SubmitButton>
                      <p className="text-xs text-slate-500">{t("certificateRegenerateHint")}</p>
                    </form>
                  </div>
                </details>
              );
            })}
          </div>
        </Section>
      </div>
    </PhaseSection>
  );
}
