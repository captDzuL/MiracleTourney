"use client";

import { ArrowLeft, ArrowRight, Check, Clock3, CreditCard, ShieldCheck, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { captainUploadPaymentProofAction } from "@/lib/actions";
import { captainRegisterEventTeamAction } from "@/lib/registration/actions";

type RegistrationEvent = {
  id: string;
  slug: string;
  name: string;
  registrationWindow: string;
  startsAt: string;
  venue: string;
  participantCap: number;
  registeredTeams: number;
  registrationFeeRequired: boolean;
  registrationFeeLabel?: string;
};

type DraftTeam = {
  id: string;
  name: string;
  tag: string;
  captainIgn?: string;
  captainUid?: string;
  captainContact?: string;
  captainIsPlayer?: boolean;
  players: Array<{ nickname: string; displayName: string; position: string }>;
};

type CurrentRequest = {
  id: string;
  status: "pending_payment" | "pending_review" | "approved" | "rejected" | "expired";
  rejectReason?: string;
  expiresAt: string;
  proofImageUrl?: string;
};

type PaymentSettings = { qrisImageUrl?: string; instructions?: string };

const fieldClass = "grid gap-1.5 text-xs font-semibold text-slate-200";
const inputClass = "min-h-11 w-full rounded-[9px] border border-[#29374a] bg-[#0c1523] px-3 text-sm text-[#f3efe7] outline-none transition placeholder:text-slate-600 focus:border-[#49d1ec] focus:ring-2 focus:ring-[#49d1ec]/20";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[#29374a] px-4 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#49d1ec]";
const primaryButton = `${buttonClass} border-[#7250d1] bg-[#7250d1] text-white`;
const softButton = `${buttonClass} bg-white/[0.035] text-[#f3efe7]`;

function StepRail({ current }: { current: number }) {
  const steps = [
    ["Pilih tim", "Identitas & roster"],
    ["Tinjau", "Pastikan data benar"],
    ["Pembayaran", "Kirim bukti"],
    ["Status", "Pantau keputusan"],
  ];

  return (
    <aside className="self-start rounded-2xl border border-[#29374a] bg-[#101b2b] p-4 shadow-2xl lg:sticky lg:top-24">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#aab7c9]">Alur pendaftaran</p>
      <div className="mt-2 grid grid-cols-4 lg:block">
        {steps.map(([title, detail], index) => {
          const number = index + 1;
          const done = number < current;
          const active = number === current;
          return (
            <div key={title} className={`grid gap-2 border-b border-[#29374a] py-3 text-center lg:grid-cols-[30px_1fr] lg:text-left ${active ? "text-[#f3efe7]" : "text-[#aab7c9]"}`}>
              <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full border text-[10px] font-bold lg:mx-0 ${done ? "border-[#49d1ec] text-[#49d1ec]" : active ? "border-[#aa8bff] bg-[#aa8bff]/10 text-[#aa8bff]" : "border-[#29374a]"}`}>
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : number}
              </span>
              <span><b className="block text-[11px]">{title}</b><span className="hidden text-[9px] lg:block">{detail}</span></span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 hidden rounded-xl border border-[#49d1ec]/25 bg-[#49d1ec]/[0.07] p-3 text-[10px] leading-5 text-[#aab7c9] lg:block">
        <b className="block text-[#49d1ec]">Berikutnya sudah jelas</b>
        Lengkapi hanya data yang dibutuhkan event ini. Draft tersimpan untuk pendaftaran berikutnya.
      </div>
    </aside>
  );
}

function StatusView({ event, request }: { event: RegistrationEvent; request: CurrentRequest }) {
  const content = {
    pending_payment: ["Pembayaran belum selesai", "Unggah bukti sebelum masa reservasi berakhir.", "Lanjutkan pembayaran"],
    pending_review: ["Bukti sedang diperiksa", "Organizer sedang memeriksa bukti pembayaranmu.", "Tidak ada tindakan yang dibutuhkan"],
    approved: ["Tim kamu sudah aktif", `${event.name} sudah menerima tim kamu sebagai peserta.`, "Pendaftaran disetujui"],
    rejected: ["Bukti pembayaran perlu diperbaiki", request.rejectReason ?? "Unggah ulang bukti pembayaran yang lebih jelas.", "Unggah bukti baru"],
    expired: ["Waktu pembayaran berakhir", "Reservasi telah dilepas. Mulai pendaftaran baru selama slot tersedia.", "Daftar ulang"],
  }[request.status];

  return (
    <div className="rounded-2xl border border-[#29374a] bg-[#101b2b] px-6 py-10 text-center shadow-2xl">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#49d1ec]/30 bg-[#49d1ec]/10 text-[#49d1ec]">
        {request.status === "approved" ? <ShieldCheck className="h-7 w-7" /> : <Clock3 className="h-7 w-7" />}
      </div>
      <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#aa8bff]">Pendaftaran saya</p>
      <h2 className="mt-2 text-2xl font-bold text-[#f3efe7]">{content[0]}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-[#aab7c9]">{content[1]}</p>
      <div className="mx-auto mt-7 grid max-w-2xl text-left sm:grid-cols-3">
        {["Pendaftaran dibuat", "Bukti pembayaran", "Keputusan organizer"].map((label, index) => (
          <div key={label} className={`border-t-2 p-3 ${index === 0 || request.status === "approved" ? "border-[#49d1ec]" : "border-[#29374a]"}`}>
            <b className="block text-[10px] text-[#f3efe7]">{label}</b>
            <span className="text-[9px] text-[#aab7c9]">{index === 0 ? "Selesai" : index === 1 && request.proofImageUrl ? "Sudah diterima" : "Menunggu"}</span>
          </div>
        ))}
      </div>
      <div className={`mx-auto mt-5 max-w-2xl rounded-xl border p-4 text-left text-sm ${request.status === "rejected" || request.status === "expired" ? "border-rose-400/30 bg-rose-400/[0.07]" : "border-[#49d1ec]/25 bg-[#49d1ec]/[0.07]"}`}>
        <b className="block text-[#f3efe7]">{content[2]}</b>
        <span className="text-[#aab7c9]">Status ini tersimpan dan dapat dibuka kembali kapan saja.</span>
      </div>
    </div>
  );
}

export function CaptainRegistrationWizard({
  event,
  positions,
  requiredPlayers,
  draftTeam,
  currentRequest,
  paymentSettings,
}: {
  event: RegistrationEvent;
  positions: string[];
  requiredPlayers: number;
  draftTeam?: DraftTeam;
  currentRequest?: CurrentRequest;
  paymentSettings?: PaymentSettings;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [useDraft, setUseDraft] = useState(Boolean(draftTeam));
  const [captainIsPlayer, setCaptainIsPlayer] = useState(draftTeam?.captainIsPlayer ?? true);
  const [teamName, setTeamName] = useState(draftTeam?.name ?? "");
  const [teamTag, setTeamTag] = useState(draftTeam?.tag ?? "");
  const [captainIgn, setCaptainIgn] = useState(draftTeam?.captainIgn ?? "");
  const [captainUid, setCaptainUid] = useState(draftTeam?.captainUid ?? "");
  const [captainContact, setCaptainContact] = useState(draftTeam?.captainContact ?? "");
  const playerSlots = requiredPlayers - (captainIsPlayer ? 1 : 0);
  const [roster, setRoster] = useState(() => {
    const players = draftTeam?.players ?? [];
    const nonCaptainPlayers = (draftTeam?.captainIsPlayer ?? true) && players[0]?.displayName === (draftTeam?.captainUid ?? "") ? players.slice(1) : players;
    return Array.from({ length: requiredPlayers }, (_, index) => ({
      ign: nonCaptainPlayers[index]?.nickname ?? "",
      uid: nonCaptainPlayers[index]?.displayName ?? "",
      position: nonCaptainPlayers[index]?.position ?? "",
    }));
  });
  const visibleRoster = roster.slice(0, playerSlots);
  const updatePlayer = (index: number, field: "ign" | "uid" | "position", value: string) => setRoster((current) => current.map((player, playerIndex) => playerIndex === index ? { ...player, [field]: value } : player));

  if (currentRequest && currentRequest.status !== "pending_payment" && currentRequest.status !== "rejected") {
    return <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]"><StepRail current={4} /><StatusView event={event} request={currentRequest} /></div>;
  }

  if (currentRequest) {
    return (
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <StepRail current={3} />
        <section className="rounded-2xl border border-[#29374a] bg-[#101b2b] p-5 shadow-2xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#aa8bff]">Langkah 3 dari 4</p><h2 className="mt-2 text-xl font-bold text-[#f3efe7]">Selesaikan pembayaran</h2><p className="mt-1 text-sm text-[#aab7c9]">Scan QRIS, lalu unggah bukti agar organizer dapat memeriksanya.</p></div>
            <span className="rounded-full border border-[#29374a] px-3 py-1.5 text-[10px] font-bold text-[#f0bf68]">Menunggu pembayaran</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid aspect-square max-w-sm place-items-center rounded-xl bg-[#f7f4ec] p-5">
              {paymentSettings?.qrisImageUrl ? <img src={paymentSettings.qrisImageUrl} alt="QRIS pembayaran" className="h-full w-full object-contain" /> : <CreditCard className="h-24 w-24 text-[#09111e]" />}
            </div>
            <div>
              <div className="rounded-xl border border-[#29374a] bg-[#0c1523] p-4 text-sm text-[#aab7c9]"><b className="block text-[#49d1ec]">Petunjuk organizer</b>{paymentSettings?.instructions ?? "Pastikan nominal dan tanggal pembayaran terlihat jelas."}</div>
              <form action={captainUploadPaymentProofAction} className="mt-3 rounded-xl border border-dashed border-[#52657f] bg-[#0c1523] p-5 text-center">
                <input type="hidden" name="requestId" value={currentRequest.id} />
                <input type="hidden" name="returnTo" value={`/events/${event.slug}/register`} />
                <Upload className="mx-auto h-7 w-7 text-[#aa8bff]" />
                <label className="mt-3 block text-sm font-semibold text-[#f3efe7]"><span>Unggah bukti pembayaran</span><input className="mt-3 block w-full text-xs text-[#aab7c9]" name="paymentProof" type="file" accept="image/png,image/jpeg,image/webp" required /></label>
                <SubmitButton className={`${primaryButton} mt-4 w-full`}>Kirim untuk diverifikasi <ArrowRight className="h-4 w-4" /></SubmitButton>
              </form>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <StepRail current={step} />
      <form ref={formRef} action={captainRegisterEventTeamAction} className="min-w-0">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="eventSlug" value={event.slug} />
        {draftTeam && useDraft ? <input type="hidden" name="draftTeamId" value={draftTeam.id} /> : null}
        <section className="rounded-2xl border border-[#29374a] bg-[#101b2b] p-5 shadow-2xl sm:p-6">
          {step === 1 ? (
            <>
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#aa8bff]">Langkah 1 dari 4</p><h2 className="mt-2 text-xl font-bold text-[#f3efe7]">Pilih atau buat tim</h2><p className="mt-1 text-sm text-[#aab7c9]">Gunakan draft yang tersimpan atau lengkapi tim inti untuk event ini.</p></div>
              {draftTeam ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setUseDraft(true)} className={`rounded-xl border p-4 text-left ${useDraft ? "border-[#aa8bff] bg-[#aa8bff]/[0.07]" : "border-[#29374a] bg-[#0c1523]"}`}><b className="text-[#f3efe7]">{draftTeam.name}</b><span className="mt-1 block text-xs text-[#aab7c9]">{draftTeam.tag} · Draft tim</span></button>
                  <button type="button" onClick={() => { setUseDraft(false); setTeamName(""); setTeamTag(""); }} className={`rounded-xl border p-4 text-left ${!useDraft ? "border-[#aa8bff] bg-[#aa8bff]/[0.07]" : "border-[#29374a] bg-[#0c1523]"}`}><b className="text-[#f3efe7]">Buat tim baru</b><span className="mt-1 block text-xs text-[#aab7c9]">Nama dan tag berbeda</span></button>
                </div>
              ) : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className={fieldClass}>Nama tim<input className={inputClass} name="name" value={teamName} onChange={(event) => setTeamName(event.target.value)} minLength={2} required /></label>
                <label className={fieldClass}>Tag tim<input className={`${inputClass} uppercase`} name="tag" value={teamTag} onChange={(event) => setTeamTag(event.target.value)} minLength={2} maxLength={5} required /></label>
                <label className={fieldClass}>Captain IGN<input className={inputClass} name="captainIgn" value={captainIgn} onChange={(event) => setCaptainIgn(event.target.value)} minLength={2} required /></label>
                <label className={fieldClass}>Captain UID / Game ID<input className={inputClass} name="captainUid" value={captainUid} onChange={(event) => setCaptainUid(event.target.value)} minLength={2} required /></label>
                <label className={`${fieldClass} sm:col-span-2`}>WhatsApp captain<input className={inputClass} name="captainContact" value={captainContact} onChange={(event) => setCaptainContact(event.target.value)} minLength={6} required /></label>
              </div>
              <label className="mt-4 flex min-h-11 items-center gap-3 rounded-xl border border-[#29374a] bg-[#0c1523] px-4 text-sm font-semibold text-[#f3efe7]"><input type="checkbox" name="captainIsPlayer" checked={captainIsPlayer} onChange={(event) => setCaptainIsPlayer(event.target.checked)} className="h-4 w-4 accent-[#7250d1]" />Kapten juga pemain inti</label>
              <div className="mt-5 border-t border-[#29374a] pt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-bold text-[#f3efe7]">Roster awal</h3><p className="text-[10px] text-[#aab7c9]">{requiredPlayers} pemain inti · UID dan IGN wajib · posisi opsional</p></div><span className="text-[10px] font-bold text-[#56d6a1]">{captainIsPlayer ? "Kapten mengisi slot pertama" : "Kapten tidak dihitung sebagai pemain"}</span></div>
                <div className="mt-3 grid gap-3">
                  {visibleRoster.map((player, index) => {
                    const number = index + 1 + (captainIsPlayer ? 1 : 0);
                    return <div key={`${number}-${captainIsPlayer}`} className="grid gap-2 rounded-xl border border-[#29374a] bg-[#0c1523] p-3 sm:grid-cols-[1fr_1fr_160px]"><label className={fieldClass}>Player {number} IGN<input className={inputClass} name="playerIgn" value={player.ign} onChange={(event) => updatePlayer(index, "ign", event.target.value)} minLength={2} required /></label><label className={fieldClass}>Player {number} UID<input className={inputClass} name="playerUid" value={player.uid} onChange={(event) => updatePlayer(index, "uid", event.target.value)} minLength={2} required /></label><label className={fieldClass}>Posisi · opsional<select className={inputClass} name="playerPosition" value={player.position} onChange={(event) => updatePlayer(index, "position", event.target.value)}><option value="">Tanpa posisi</option>{positions.map((position) => <option key={position}>{position}</option>)}</select></label></div>;
                  })}
                </div>
              </div>
              <div className="mt-6 flex justify-end border-t border-[#29374a] pt-5"><button type="button" onClick={() => { if (formRef.current?.reportValidity()) setStep(2); }} className={primaryButton}>Tinjau pilihan <ArrowRight className="h-4 w-4" /></button></div>
            </>
          ) : (
            <>
              <input type="hidden" name="name" value={teamName} />
              <input type="hidden" name="tag" value={teamTag} />
              <input type="hidden" name="captainIgn" value={captainIgn} />
              <input type="hidden" name="captainUid" value={captainUid} />
              <input type="hidden" name="captainContact" value={captainContact} />
              {captainIsPlayer ? <input type="hidden" name="captainIsPlayer" value="true" /> : null}
              {visibleRoster.map((player, index) => <span key={`hidden-player-${index}`}><input type="hidden" name="playerIgn" value={player.ign} /><input type="hidden" name="playerUid" value={player.uid} /><input type="hidden" name="playerPosition" value={player.position} /></span>)}
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#aa8bff]">Langkah 2 dari 4</p><h2 className="mt-2 text-xl font-bold text-[#f3efe7]">Tinjau data sebelum mendaftar</h2><p className="mt-1 text-sm text-[#aab7c9]">Pastikan identitas captain dan roster sudah benar untuk event ini.</p></div><button type="button" className={softButton} onClick={() => setStep(1)}>Ganti tim</button></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{visibleRoster.map((player, index) => <div key={`review-${index}`} className="rounded-lg border border-[#29374a] bg-[#0c1523] p-3"><b className="block text-xs text-[#f3efe7]">{player.ign || `Player ${index + 1}`}</b><span className="mt-1 block text-[10px] text-[#aab7c9]">UID {player.uid || "-"}{player.position ? ` · ${player.position}` : ""}</span></div>)}</div>
              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]"><div className="rounded-xl border border-[#29374a] bg-[#0c1523] p-4"><h3 className="text-sm font-bold text-[#f3efe7]">Roster {teamName}</h3><p className="mt-2 text-sm text-[#aab7c9]">{requiredPlayers} pemain inti · Kapten {captainIsPlayer ? "termasuk roster" : "di luar roster"}</p><div className="mt-4 rounded-lg border border-[#29374a] p-3"><b className="text-[#f3efe7]">{captainIgn}</b><span className="ml-2 text-xs text-[#aab7c9]">UID {captainUid} · Captain</span></div></div><aside className="grid gap-2"><div className="flex justify-between gap-4 rounded-xl border border-[#29374a] bg-[#0c1523] p-3 text-sm"><span className="text-[#aab7c9]">Event</span><b className="text-right text-[#f3efe7]">{event.name}</b></div><div className="flex justify-between gap-4 rounded-xl border border-[#29374a] bg-[#0c1523] p-3 text-sm"><span className="text-[#aab7c9]">Tim</span><b className="text-right text-[#f3efe7]">{teamName} · {teamTag.toUpperCase()}</b></div><div className="flex justify-between gap-4 rounded-xl border border-[#29374a] bg-[#0c1523] p-3 text-sm"><span className="text-[#aab7c9]">Biaya</span><b className="text-right text-[#f3efe7]">{event.registrationFeeLabel ?? "Gratis"}</b></div><div className="flex justify-between gap-4 rounded-xl border border-[#29374a] bg-[#0c1523] p-3 text-sm"><span className="text-[#aab7c9]">Slot</span><b className="text-right text-[#f3efe7]">{event.registeredTeams} / {event.participantCap}</b></div></aside></div>
              <div className="mt-4 rounded-xl border border-[#49d1ec]/25 bg-[#49d1ec]/[0.07] p-4 text-sm text-[#aab7c9]"><b className="text-[#49d1ec]">Nama dan tag diamankan selama 24 jam.</b><br />Satu captain hanya dapat memiliki satu pendaftaran aktif pada event ini.</div>
              <div className="mt-6 flex flex-col-reverse justify-between gap-3 border-t border-[#29374a] pt-5 sm:flex-row"><button type="button" className={softButton} onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Kembali</button><div className="flex flex-wrap justify-end gap-2"><button type="submit" className={softButton} name="intent" value="draft">Simpan Draft</button><SubmitButton className={primaryButton}>{event.registrationFeeRequired ? "Buat pendaftaran dan bayar" : "Kirim pendaftaran"}<ArrowRight className="h-4 w-4" /></SubmitButton></div></div>
            </>
          )}
        </section>
      </form>
    </div>
  );
}
