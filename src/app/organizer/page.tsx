import { BadgeCheck, BarChart3, FileSpreadsheet, ListTree, ShieldCheck, Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation";

const capabilities = [
  { title: "Import registrasi", body: "Masukkan tim dari CSV/Google Form dan buat credential kapten otomatis.", icon: FileSpreadsheet },
  { title: "Bracket dan liga", body: "Jalankan single elimination atau league dengan hasil yang langsung tampil publik.", icon: ListTree },
  { title: "BO series", body: "Atur BO1, BO3, atau BO5 per ronde dan simpan skor per game.", icon: Trophy },
  { title: "Review statistik", body: "Kapten submit statistik, organizer approve sebelum masuk leaderboard.", icon: BarChart3 },
  { title: "Bukti juara", body: "Publikasikan champion, certificate, dan halaman hasil yang bisa dibagikan.", icon: BadgeCheck },
  { title: "Akses terkunci", body: "Organizer hanya mengelola event miliknya; platform admin menjaga keseluruhan.", icon: ShieldCheck },
];

export default function OrganizerPage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8 lg:p-10">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-black leading-tight sm:text-5xl">Buat turnamen yang hasilnya rapi sampai selesai.</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Miracle membantu organizer menjalankan event, bukan hanya membuka pendaftaran: import tim, bracket, match day, statistik,
            leaderboard, dan bukti juara tinggal di satu tempat.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login" className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300">
              Masuk sebagai Organizer
            </Link>
            <Link href="/events" className="rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">
              Lihat Event Publik
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Icon className="h-5 w-5 text-cyan-600" />
              <h2 className="mt-4 text-lg font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
