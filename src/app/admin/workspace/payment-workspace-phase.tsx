// Phase of the admin workspace: payment requests and settings.
// Moved out of admin-workspace.tsx without changes (refactor Phase 4, 4a-admin).

import { EventOptions, PhaseSection, StatusChip, inputClass, labelClass, primaryButton, quietButton } from "@/app/admin/workspace/shared";
import type { AdminTranslator, EventItem, PaymentRequestItem, PaymentSettingsItem } from "@/app/admin/workspace/shared";
import { SubmitButton } from "@/components/submit-button";
import { Section } from "@/components/ui";
import { adminApprovePaymentAction, adminRejectPaymentAction, adminUpdatePaymentSettingsAction } from "@/lib/actions/registration-actions";
import { Check, Save, SlidersHorizontal, X } from "lucide-react";
import Image from "next/image";

export function PaymentWorkspacePhase({
  activeEvent,
  events,
  paymentRequests,
  paymentSettings,
  canEditPaymentSettings,
  paymentStatus,
  t,
}: {
  activeEvent: EventItem | undefined;
  events: EventItem[];
  paymentRequests: PaymentRequestItem[];
  paymentSettings: PaymentSettingsItem;
  canEditPaymentSettings: boolean;
  paymentStatus?: PaymentRequestItem["status"];
  t: AdminTranslator;
}) {
  const statusOptions = ["pending_payment", "pending_review", "approved", "rejected", "expired"] as const;

  return (
    <PhaseSection
      action={<StatusChip tone={paymentRequests.some((request) => request.status === "pending_review") ? "warning" : "default"}>{paymentRequests.length} pembayaran</StatusChip>}
      description={t("paymentsDescription")}
      title={t("paymentsWorkspaceTitle")}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.75fr)]">
        <Section title={t("paymentQueueTitle")} description={t("paymentQueueDescription")} className="rounded-xl shadow-none">
          <form action="" className="mb-4 grid gap-3 md:grid-cols-[1fr_14rem_auto] md:items-end">
            <input type="hidden" name="phase" value="registration" />
            <label className={labelClass}>
              {t("eventLabel")}
              <select className={inputClass} name="activeEventId" defaultValue={activeEvent?.id ?? ""}>
                <option value="">Semua event</option>
                <EventOptions events={events} />
              </select>
            </label>
            <label className={labelClass}>
              {t("statusLabel")}
              <select className={inputClass} name="paymentStatus" defaultValue={paymentStatus ?? ""}>
                <option value="">Semua status</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{t(`paymentStatus.${status}`)}</option>
                ))}
              </select>
            </label>
            <button className={quietButton} type="submit">
              <SlidersHorizontal className="h-4 w-4" />
              Filter
            </button>
          </form>

          {paymentRequests.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">{t("noPaymentRequests")}</p>
          ) : (
            <div className="grid gap-3">
              {paymentRequests.map((request) => (
                <details key={request.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{request.teamName} ({request.teamTag})</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {request.event?.name ?? request.eventId} - {request.captain?.name ?? request.captainId}
                      </p>
                    </div>
                    <StatusChip tone={request.status === "pending_review" ? "warning" : request.status === "approved" ? "success" : "default"}>
                      {t(`paymentStatus.${request.status}`)}
                    </StatusChip>
                  </summary>
                  <div className="grid gap-4 border-t border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                    <div className="space-y-3 text-sm text-slate-600">
                      <p><span className="font-semibold text-slate-900">Captain:</span> {request.captain?.email ?? request.captainId}</p>
                      <p><span className="font-semibold text-slate-900">Fee:</span> {request.event?.registrationFeeLabel ?? request.event?.registrationFeeAmount ?? "-"}</p>
                      <p><span className="font-semibold text-slate-900">Expired:</span> {new Date(request.expiresAt).toLocaleString()}</p>
                      {request.rejectReason ? <p className="text-red-700">{request.rejectReason}</p> : null}
                      <div className="flex flex-wrap gap-3">
                        {request.status === "pending_review" ? (
                          <form action={adminApprovePaymentAction}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <SubmitButton className={primaryButton}>
                              <Check className="h-4 w-4" />
                              {t("approve")}
                            </SubmitButton>
                          </form>
                        ) : null}
                        {request.status === "pending_review" || request.status === "pending_payment" ? (
                          <form action={adminRejectPaymentAction} className="flex flex-wrap gap-2">
                            <input type="hidden" name="requestId" value={request.id} />
                            <input className={inputClass} name="reason" placeholder={t("paymentRejectReason")} minLength={3} required />
                            <SubmitButton className={quietButton}>
                              <X className="h-4 w-4" />
                              {t("reject")}
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      {request.proofImageUrl ? (
                        <a href={request.proofImageUrl} target="_blank" rel="noreferrer" className="block">
                          <span className="relative block aspect-square w-full"><Image src={request.proofImageUrl} alt="Bukti bayar" fill sizes="(max-width: 768px) 100vw, 50vw" loading="eager" unoptimized className="rounded-lg object-contain" /></span>
                          <span className="mt-2 block break-all text-xs font-semibold text-cyan-700 underline">{request.proofImageUrl}</span>
                        </a>
                      ) : (
                        <p className="text-sm text-slate-500">{t("noPaymentProof")}</p>
                      )}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </Section>

        {canEditPaymentSettings ? (
          <Section title={t("paymentSettingsTitle")} description={t("paymentSettingsDescription")} className="rounded-xl shadow-none">
            <form action={adminUpdatePaymentSettingsAction} className="grid gap-4">
              <label className={labelClass}>
                Upload gambar QRIS (opsional, override URL di bawah)
                <input type="file" name="qrisImage" accept="image/png,image/webp,image/jpeg" className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`} />
              </label>
              <label className={labelClass}>
                QRIS URL
                <input className={inputClass} name="qrisImageUrl" defaultValue={paymentSettings.qrisImageUrl ?? ""} placeholder="https://... atau /payment/qris.png" />
              </label>
              <label className={labelClass}>
                Instruksi pembayaran
                <textarea className={`${inputClass} min-h-28 resize-y leading-6`} name="instructions" defaultValue={paymentSettings.instructions ?? ""} maxLength={500} />
              </label>
              {paymentSettings.qrisImageUrl ? (
                <Image src={paymentSettings.qrisImageUrl} alt="QRIS aktif" width={176} height={176} loading="eager" unoptimized className="aspect-square w-44 rounded-lg border border-slate-200 bg-slate-50 object-contain" />
              ) : null}
              <SubmitButton className={primaryButton}>
                <Save className="h-4 w-4" />
                {t("savePaymentSettings")}
              </SubmitButton>
            </form>
          </Section>
        ) : null}
      </div>
    </PhaseSection>
  );
}
