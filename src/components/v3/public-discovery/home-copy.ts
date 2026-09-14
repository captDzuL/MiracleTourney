import type { PublicV3EventViewModel, PublicV3Locale } from "@/lib/events/public-v3-types";

export const homeCopy = {
  id: {
    frontRow: "TEMPAT TERDEPAN UNTUK SETIAP PERTANDINGAN", home: "Beranda", featured: "Event utama", allEvents: "Lihat semua event", login: "Masuk", skip: "Lewati ke konten", mainNav: "Navigasi utama", nav: "Navigasi event utama",
    overview: "Overview", participants: "Peserta", schedule: "Jadwal", bracket: "Bracket", leaderboard: "Leaderboard",
    arena: "Di dalam arena", explore: "Masuk event center", other: "Event lain", ongoing: "Berlangsung", upcoming: "Akan datang / Registrasi", finished: "Selesai", archive: "Arsip selesai", allGames: "Semua game", filters: "Filter game",
    registration: "Pendaftaran", drawing: "Drawing", live: "Berlangsung", final: "Selesai", next: "Pertandingan berikutnya", official: "Hasil resmi", noMatch: "Belum ada pertandingan untuk ditampilkan.", noNext: "Jadwal pertandingan berikutnya belum tersedia.", noScore: "Skor belum diterbitkan", empty: "Belum ada event dalam filter ini.", error: "Data event belum dapat dimuat. Coba lagi beberapa saat.", unavailable: "Event utama belum tersedia", starts: "Mulai", venue: "Venue", prize: "Prize pool", teams: "tim", pending: "Belum diumumkan", slots: "slot tersedia", registered: "tim terdaftar", drawingReady: "Drawing resmi sudah terbit", drawingPending: "Drawing resmi belum diterbitkan", champion: "Juara", resultsPending: "Hasil akhir belum tersedia", register: "Daftarkan tim", registrationUnavailable: "Pendaftaran belum tersedia", viewBracket: "Lihat bracket", viewLeaderboard: "Lihat leaderboard", bestOf: "Best of", organizer: "Diselenggarakan oleh", verified: "Terverifikasi", footer: "Kompetisi komunitas. Cerita yang layak diikuti.",
    descriptions: ["Cerita dan informasi event", "Kenali tim dan rosternya", "Jangan lewatkan pertandingan", "Ikuti perjalanan menuju final", "Pemain di balik setiap kemenangan"],
  },
  en: {
    frontRow: "YOUR FRONT ROW TO THE GAME", home: "Home", featured: "Featured event", allEvents: "View all events", login: "Sign in", skip: "Skip to content", mainNav: "Main navigation", nav: "Featured event navigation",
    overview: "Overview", participants: "Participants", schedule: "Schedule", bracket: "Bracket", leaderboard: "Leaderboard",
    arena: "Inside the arena", explore: "Enter event center", other: "Other events", ongoing: "Ongoing", upcoming: "Upcoming / Registration", finished: "Finished", archive: "Finished archive", allGames: "All games", filters: "Game filters",
    registration: "Registration", drawing: "Drawing", live: "Ongoing", final: "Finished", next: "Next match", official: "Official result", noMatch: "No matches are available yet.", noNext: "The next match has not been scheduled yet.", noScore: "Score not published", empty: "No events match this filter.", error: "Event data is temporarily unavailable. Please try again shortly.", unavailable: "Featured event unavailable", starts: "Starts", venue: "Venue", prize: "Prize pool", teams: "teams", pending: "To be announced", slots: "slots available", registered: "registered teams", drawingReady: "The official draw is published", drawingPending: "The official draw is not published yet", champion: "Champion", resultsPending: "Final results are not available yet", register: "Register a team", registrationUnavailable: "Registration unavailable", viewBracket: "View bracket", viewLeaderboard: "View leaderboard", bestOf: "Best of", organizer: "Organized by", verified: "Verified", footer: "Community competition. Stories worth following.",
    descriptions: ["The event story and essentials", "Meet the teams and rosters", "Never miss a match", "Follow the road to the final", "The players behind every win"],
  },
} as const;

const explanationsId: Record<string, string> = {
  "registration.authoritative": "Informasi pendaftaran resmi tersedia.",
  "registration.compatible": "Informasi pendaftaran tersedia dari data event tersimpan.",
  "drawing.authoritative": "Drawing resmi telah diterbitkan.",
  "drawing.compatible": "Drawing belum diterbitkan secara resmi.",
  "ongoing.authoritative": "Event berlangsung dengan jadwal dan hasil resmi.",
  "ongoing.compatible": "Event berlangsung menggunakan jadwal dan hasil tersimpan terbaru.",
  "finished.authoritative": "Event selesai dengan hasil resmi dan penghargaan yang telah diterbitkan.",
  "finished.compatible": "Event selesai; penghargaan tampil setelah publikasi diverifikasi.",
};
export function homeStatusExplanation(view: PublicV3EventViewModel, locale: PublicV3Locale) {
  return locale === "id" ? explanationsId[view.statusExplanationKey] ?? homeCopy.id.pending : view.statusExplanation;
}
export function homeDate(value: string | null, locale: PublicV3Locale, timezone?: string) {
  if (!value || value === "TBD") return homeCopy[locale].pending;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return homeCopy[locale].pending;
  const zone = timezone && timezone !== "TBD" ? timezone : "UTC";
  try { return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(date) + ` · ${zone}`; }
  catch { return date.toISOString(); }
}
