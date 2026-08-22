import { CheckCircle2, History, ImageUp, Move, XCircle } from "lucide-react";

import {
  adminActivateEventVisualAction,
  adminApproveEventVisualAction,
  adminRejectEventVisualAction,
  adminSetEventVisualFocalPointAction,
  adminUploadEventVisualAction,
} from "@/lib/actions";
import type { EventVisualAsset } from "@/lib/platform/types";

const SOURCE_LABELS: Record<string, string> = {
  organizer_upload: "Upload organizer",
  ai_generated: "Dibuat AI",
};

const STATUS_LABELS: Record<string, string> = {
  generating: "Sedang dibuat",
  ready_for_review: "Menunggu review",
  approved: "Disetujui",
  rejected: "Ditolak",
  failed: "Gagal",
};

/**
 * Error codes come from providers we do not control, so they are mapped to a
 * fixed set of Indonesian labels. Unknown codes fall back to a generic message
 * instead of being rendered raw.
 */
const ERROR_LABELS: Record<string, string> = {
  rights_not_attested: "Hak publikasi belum dikonfirmasi.",
  content_policy: "Artwork ditolak oleh filter konten.",
  rate_limited: "Batas percobaan tercapai, coba lagi nanti.",
  timeout: "Proses melebihi batas waktu.",
};

function safeErrorLabel(errorCode?: string): string | null {
  if (!errorCode) return null;
  return ERROR_LABELS[errorCode] ?? "Revisi gagal diproses.";
}

function formatDate(value?: Date): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusToneClass(status: string): string {
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "ready_for_review") return "bg-amber-100 text-amber-700";
  if (status === "rejected" || status === "failed") return "bg-rose-100 text-rose-700";
  return "bg-slate-200 text-slate-700";
}

/** Active revision first, then everything else newest-first. */
function orderRevisions(assets: EventVisualAsset[], activeAssetId?: string): EventVisualAsset[] {
  const active = activeAssetId ? assets.find((asset) => asset.id === activeAssetId) : undefined;
  const rest = assets
    .filter((asset) => asset.id !== active?.id)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return active ? [active, ...rest] : rest;
}

const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500";
const buttonClass =
  "inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100";

export function EventVisualAssetsPanel({
  eventId,
  eventName,
  activeAssetId,
  assets,
}: {
  eventId: string;
  eventName: string;
  activeAssetId?: string;
  assets: EventVisualAsset[];
}) {
  const revisions = orderRevisions(assets, activeAssetId);

  return (
    <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-950">Background event</p>
        <p className="text-xs text-slate-500">
          Setiap upload menjadi revisi baru. Revisi aktif dipakai di halaman publik {eventName}.
        </p>
      </div>

      <form action={adminUploadEventVisualAction} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <input type="hidden" name="eventId" value={eventId} />
        <p className="text-xs text-slate-500">Disarankan 16:9. PNG, JPG, atau WebP. Maks 5 MB.</p>
        <input
          type="file"
          name="eventVisual"
          accept="image/png,image/webp,image/jpeg"
          required
          className={`${fieldClass} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700`}
        />
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" name="rightsAttestation" value="confirmed" required className="mt-0.5" />
          <span>Saya memiliki izin untuk mempublikasikan artwork ini.</span>
        </label>
        <button type="submit" className={buttonClass}>
          <ImageUp className="h-4 w-4" />
          Upload revisi
        </button>
      </form>

      {revisions.length ? (
        <ul className="grid gap-3">
          {revisions.map((asset) => {
            const isActive = asset.id === activeAssetId;
            const errorLabel = safeErrorLabel(asset.errorCode);
            const canApprove = asset.status === "ready_for_review";
            const canActivate = asset.status === "approved" && !isActive;
            const canReject = !isActive && (asset.status === "ready_for_review" || asset.status === "approved");
            const canSetFocal = asset.status === "approved" || asset.status === "ready_for_review";

            return (
              <li key={asset.id} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-900">
                  {asset.url ? (
                    <img
                      src={asset.url}
                      alt={`Preview revisi ${asset.id}`}
                      className="aspect-video w-full object-cover"
                      style={{ objectPosition: `${asset.focalX * 100}% ${asset.focalY * 100}%` }}
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-xs text-slate-400">
                      Tanpa preview
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {isActive ? (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">Aktif</span>
                    ) : null}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusToneClass(asset.status)}`}>
                      {STATUS_LABELS[asset.status] ?? asset.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {SOURCE_LABELS[asset.source] ?? asset.source}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                    <div>
                      <dt className="inline font-semibold text-slate-500">Dimensi: </dt>
                      <dd className="inline">{asset.width && asset.height ? `${asset.width} x ${asset.height} px` : "-"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-500">Focal: </dt>
                      <dd className="inline">{asset.focalX.toFixed(2)} / {asset.focalY.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-500">Dibuat: </dt>
                      <dd className="inline">{formatDate(asset.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-500">Disetujui: </dt>
                      <dd className="inline">{formatDate(asset.approvedAt)}</dd>
                    </div>
                  </dl>

                  {errorLabel ? <p className="text-xs font-semibold text-rose-600">{errorLabel}</p> : null}

                  <div className="flex flex-wrap items-end gap-2">
                    {canApprove ? (
                      <form action={adminApproveEventVisualAction}>
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="assetId" value={asset.id} />
                        <button type="submit" className={buttonClass}>
                          <CheckCircle2 className="h-4 w-4" />
                          Setujui
                        </button>
                      </form>
                    ) : null}

                    {canActivate ? (
                      <form action={adminActivateEventVisualAction}>
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="assetId" value={asset.id} />
                        <button type="submit" className={buttonClass}>
                          <History className="h-4 w-4" />
                          Jadikan aktif
                        </button>
                      </form>
                    ) : null}

                    {canReject ? (
                      <form action={adminRejectEventVisualAction}>
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="assetId" value={asset.id} />
                        <button type="submit" className={buttonClass}>
                          <XCircle className="h-4 w-4" />
                          Tolak
                        </button>
                      </form>
                    ) : null}

                    {canSetFocal ? (
                      <form action={adminSetEventVisualFocalPointAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="assetId" value={asset.id} />
                        <label className="grid gap-1 text-[11px] font-semibold text-slate-500">
                          Focal X
                          <input
                            type="number"
                            name="focalX"
                            step="0.01"
                            min="0"
                            max="1"
                            defaultValue={asset.focalX}
                            className={`${fieldClass} w-24`}
                          />
                        </label>
                        <label className="grid gap-1 text-[11px] font-semibold text-slate-500">
                          Focal Y
                          <input
                            type="number"
                            name="focalY"
                            step="0.01"
                            min="0"
                            max="1"
                            defaultValue={asset.focalY}
                            className={`${fieldClass} w-24`}
                          />
                        </label>
                        <button type="submit" className={buttonClass}>
                          <Move className="h-4 w-4" />
                          Simpan focal
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
          Belum ada revisi background untuk event ini.
        </p>
      )}
    </div>
  );
}
