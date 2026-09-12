import { Eye, FileSpreadsheet, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";

import { CopyRegistrationLinkButton } from "./CopyRegistrationLinkButton";

type ControlCenterEvent = {
  id: string;
  slug: string;
  name: string;
  registrationWindow: string;
  participantCap: number;
  registrationFeeLabel?: string;
};

export function RegistrationControlCenterShell({
  event,
  registeredTeams,
  rosterLabel,
  pendingReviewCount,
  importErrorCount,
  importPanel,
  paymentPanel,
}: {
  event?: ControlCenterEvent;
  registeredTeams: number;
  rosterLabel?: string;
  pendingReviewCount: number;
  importErrorCount: number;
  importPanel: ReactNode;
  paymentPanel: ReactNode;
}) {
  if (!event) {
    return <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Pilih atau buat event untuk membuka pusat registrasi.</p>;
  }

  const slotsLeft = Math.max(event.participantCap - registeredTeams, 0);
  const registrationPath = `/events/${event.slug}/register`;
  const nextAction = pendingReviewCount > 0
    ? `${pendingReviewCount} registrasi perlu ditinjau.`
    : importErrorCount > 0
      ? `${importErrorCount} baris impor perlu diperbaiki.`
      : `Bagikan link registrasi untuk mengisi ${slotsLeft} slot tersisa.`;

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">Registration control center</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-2xl font-bold">{event.name}</h2><p className="mt-1 text-sm text-slate-300">{nextAction}</p></div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold">{registeredTeams}/{event.participantCap} tim</span>
          </div>
        </div>

        <div className="grid border-b border-slate-200 sm:grid-cols-4">
          <Summary label="Periode" value={event.registrationWindow} />
          <Summary label="Kapasitas" value={`${event.participantCap} tim`} />
          <Summary label="Biaya" value={event.registrationFeeLabel ?? "Gratis"} />
          <Summary label="Roster" value={rosterLabel ?? "Sesuai mode event"} />
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-2 sm:p-6">
          <article className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-4">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-100 text-cyan-700"><Users className="h-5 w-5" /></span><div><h3 className="font-bold text-slate-950">Captain Registration</h3><p className="mt-1 text-sm text-slate-600">Captain mengisi tim, IGN, UID, roster inti, dan pembayaran langsung di Miracle.</p></div></div>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyRegistrationLinkButton path={registrationPath} />
              <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700" href={registrationPath} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" /> Preview</a>
              <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700" href={`?phase=prepare&activeEventId=${event.id}`}><Settings className="h-4 w-4" /> Settings</a>
            </div>
          </article>

          <article className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700"><FileSpreadsheet className="h-5 w-5" /></span><div><h3 className="font-bold text-slate-950">Import XLSX / CSV</h3><p className="mt-1 text-sm text-slate-600">Upload, petakan kolom, validasi, preview, lalu import ke antrean yang sama.</p></div></div>
            <a className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-violet-600 px-3.5 text-sm font-semibold text-white" href="#registration-import">Mulai import</a>
          </article>
        </div>
      </section>

      {importPanel ? <div id="registration-import">{importPanel}</div> : null}
      {paymentPanel ? <div id="registration-payments">{paymentPanel}</div> : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-slate-200 px-5 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-950">{value}</p></div>;
}
