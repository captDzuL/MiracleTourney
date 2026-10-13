// Payment requests of the captain.
// Moved out of page.tsx without changes (refactor Phase 4, 4b-captain).

import { inputClass, labelClass, primaryButton } from "@/app/captain/dashboard/shared";
import type { TFn } from "@/app/captain/dashboard/shared";
import { SubmitButton } from "@/components/submit-button";
import { captainUploadPaymentProofAction } from "@/lib/actions/registration-actions";
import type { PaymentSettings, TeamRegistrationRequest } from "@/lib/platform/types";
import { Clock, CreditCard, Upload } from "lucide-react";
import Image from "next/image";

export function PaymentRequestsSection({ paymentSettingsByEvent, requests, t }: { paymentSettingsByEvent: Map<string, PaymentSettings>; requests: TeamRegistrationRequest[]; t: TFn }) {
  if (requests.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{t("paymentRequestsTitle")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("paymentRequestsDescription")}</p>
        </div>
      </div>
      <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
        {requests.map((request) => {
          const paymentSettings = paymentSettingsByEvent.get(request.eventId) ?? { id: request.eventId };
          return (
          <div key={request.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(14rem,0.8fr)_minmax(16rem,24rem)] lg:items-start">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-950">{request.event?.name ?? request.eventId}</p>
              <p className="mt-1 text-sm text-slate-600">{request.teamName} ({request.teamTag})</p>
              <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                <Clock className="h-3.5 w-3.5" />
                {t(`paymentStatus_${request.status}`)}
              </p>
              {request.rejectReason ? <p className="mt-2 text-sm text-red-700">{request.rejectReason}</p> : null}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
              <p className="flex items-center gap-2 font-semibold text-slate-900"><CreditCard className="h-4 w-4" />{t("paymentInstructionsTitle")}</p>
              {request.event?.registrationFeeLabel ? <p className="mt-2 font-medium text-slate-800">{request.event.registrationFeeLabel}</p> : null}
              {paymentSettings.instructions ? <p className="mt-2 leading-6">{paymentSettings.instructions}</p> : null}
              {paymentSettings.qrisImageUrl ? (
                <Image src={paymentSettings.qrisImageUrl} alt="QRIS" width={144} height={144} loading="eager" unoptimized className="mt-3 aspect-square w-36 rounded-lg border border-slate-200 bg-white object-contain" />
              ) : (
                <p className="mt-2 text-amber-700">{t("noQrisConfigured")}</p>
              )}
            </div>
            {request.status === "pending_payment" || request.status === "rejected" ? (
              <form action={captainUploadPaymentProofAction} className="grid gap-3">
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="eventId" value={request.eventId} />
                <label className={labelClass}>
                  {t("paymentProof")}
                  <input className={inputClass} name="paymentProof" type="file" accept="image/png,image/jpeg,image/webp" required />
                </label>
                <SubmitButton className={primaryButton}>
                  <Upload className="h-4 w-4" />
                  {t("uploadPaymentProof")}
                </SubmitButton>
              </form>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium text-slate-600">{t(`paymentStatus_${request.status}`)}</p>
            )}
          </div>
          );
        })}
      </div>
    </section>
  );
}
