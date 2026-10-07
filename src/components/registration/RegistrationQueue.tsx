import { Search, SlidersHorizontal } from "lucide-react";

import { filterRegistrationRecords, type RegistrationRecord, type RegistrationSource, type RegistrationStatus } from "@/lib/registration/records";

const tabs: Array<{ label: string; value?: RegistrationStatus }> = [
  { label: "Semua" },
  { label: "Perlu Ditinjau", value: "pending_review" },
  { label: "Menunggu Pembayaran", value: "pending_payment" },
  { label: "Diterima", value: "accepted" },
  { label: "Ditolak", value: "rejected" },
  { label: "Draft / Perlu Perbaikan", value: "needs_correction" },
];

export function RegistrationQueue({ eventId, records, status, source, query, page }: {
  eventId: string;
  records: RegistrationRecord[];
  status?: RegistrationStatus;
  source?: RegistrationSource;
  query?: string;
  page?: number;
}) {
  const result = filterRegistrationRecords(records, { status, source, query, page, pageSize: 10 });
  const hrefFor = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ phase: "registration", activeEventId: eventId });
    const values = { registrationStatus: status, registrationSource: source, registrationQuery: query, ...updates };
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    return `?${params.toString()}`;
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-slate-950">Daftar pendaftar</h2><p className="mt-1 text-sm text-slate-500">Captain native dan hasil import bermuara ke antrean operasional yang sama.</p></div>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3" aria-label="Status pendaftar">
        {tabs.map((tab) => <a key={tab.label} href={hrefFor({ registrationStatus: tab.value, registrationPage: undefined })} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${status === tab.value ? "border-cyan-500 text-cyan-700" : "border-transparent text-slate-500"}`}>{tab.label}</a>)}
      </nav>
      <form className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_14rem_auto]">
        <input type="hidden" name="phase" value="registration" /><input type="hidden" name="activeEventId" value={eventId} />{status ? <input type="hidden" name="registrationStatus" value={status} /> : null}
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm" name="registrationQuery" defaultValue={query} placeholder="Cari tim atau captain" /></label>
        <select className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" name="registrationSource" defaultValue={source ?? ""}><option value="">Semua source</option><option value="captain_registration">Captain Registration</option><option value="import_xlsx">Import XLSX</option><option value="import_csv">Import CSV</option></select>
        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold" type="submit"><SlidersHorizontal className="h-4 w-4" /> Filter</button>
      </form>
      {result.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Tim</th><th className="px-5 py-3">Captain</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{result.items.map((record) => <tr key={record.id} className="border-t border-slate-100"><td className="px-5 py-4 font-semibold text-slate-950">{record.teamName} <span className="text-xs text-slate-400">{record.teamTag}</span></td><td className="px-5 py-4 text-slate-600">{record.captainIgn ?? record.captainName}</td><td className="px-5 py-4 text-slate-600">{record.source.replaceAll("_", " ")}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{record.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">Belum ada pendaftar pada filter ini.</p>}
      <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-500"><span>{result.total} pendaftar</span><div className="flex gap-2"><a aria-disabled={result.page <= 1} className="rounded border border-slate-200 px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-40" href={hrefFor({ registrationPage: String(Math.max(1, result.page - 1)) })}>Sebelumnya</a><a aria-disabled={result.page >= result.totalPages} className="rounded border border-slate-200 px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-40" href={hrefFor({ registrationPage: String(Math.min(result.totalPages, result.page + 1)) })}>Berikutnya</a></div></div>
    </section>
  );
}
