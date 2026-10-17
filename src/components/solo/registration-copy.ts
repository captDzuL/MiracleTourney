export type Locale = "id" | "en";

type Text = (value: string) => string;

export type SoloCopy = {
  title: string;
  formIntro: string;
  ign: string;
  uid: string;
  primaryPosition: string;
  pickPosition: string;
  secondaryPosition: string;
  noSecondary: string;
  emergencyHint: Text;
  willingCaptain: string;
  whatsapp: string;
  whatsappHint: string;
  shareContact: string;
  submit: string;
  feeNote: Text;
  freeNote: string;
  yourDetails: (ign: string, uid: string, position: string) => string;
  queuedTitle: string;
  queuedBody: (position: string, group: string) => string;
  queuedBodyUnknown: string;
  payTitle: string;
  payBody: Text;
  fee: Text;
  scanQris: string;
  qrisAlt: string;
  organizerNote: string;
  noQris: string;
  proofLabel: string;
  proofHint: string;
  sendProof: string;
  reviewTitle: string;
  reviewBody: string;
  rejectedTitle: string;
  rejectedBody: (reason: string, deadline: string) => string;
  approvedTitle: string;
  approvedBody: string;
  withdraw: string;
  withdrawHint: string;
  signInTitle: string;
  signInBody: string;
  signIn: string;
  createAccount: string;
  wrongRoleTitle: string;
  wrongRoleBody: string;
  notOpen: string;
  closed: string;
  back: string;
};

const id: SoloCopy = {
  title: "Daftar solo",
  formIntro: "Isi data game kamu. Kalau slot penuh, kamu masuk antrean dan belum perlu bayar.",
  ign: "IGN",
  uid: "UID",
  primaryPosition: "Posisi utama",
  pickPosition: "Pilih posisi",
  secondaryPosition: "Posisi cadangan",
  noSecondary: "Tidak ada",
  emergencyHint: (position) => `Pilih ${position} kalau kamu mau jadi pengganti ${position} yang kurang.`,
  willingCaptain: "Saya mau jadi kapten",
  whatsapp: "Nomor WhatsApp",
  whatsappHint: "Dipakai untuk menghubungi tim dan organizer.",
  shareContact: "Boleh dilihat teman satu tim setelah tim dikunci",
  submit: "Daftar solo",
  feeNote: (fee) => `Biaya ${fee}. Bayar setelah kamu dapat slot.`,
  freeNote: "Gratis.",
  yourDetails: (ign, uid, position) => `IGN ${ign} · UID ${uid} · ${position}`,
  queuedTitle: "Kamu di antrean",
  queuedBody: (position, group) => `Antrean ke-${position} untuk ${group}. Kamu belum perlu bayar, kami kirim email kalau slot terbuka.`,
  queuedBodyUnknown: "Kamu di antrean. Kamu belum perlu bayar, kami kirim email kalau slot terbuka.",
  payTitle: "Bayar untuk mengamankan slot",
  payBody: (deadline) => `Bayar sebelum ${deadline}. Lewat dari itu, slot diberikan ke pemain berikutnya.`,
  fee: (fee) => `Biaya: ${fee}`,
  scanQris: "Scan QRIS, lalu unggah bukti bayar.",
  qrisAlt: "QRIS pembayaran",
  organizerNote: "Petunjuk organizer",
  noQris: "Organizer belum menyiapkan QRIS. Hubungi organizer.",
  proofLabel: "Bukti bayar",
  proofHint: "Gambar PNG, JPG, atau WebP. Maksimal 2 MB.",
  sendProof: "Kirim bukti bayar",
  reviewTitle: "Bukti bayar sedang dicek",
  reviewBody: "Organizer akan memeriksa bukti bayarmu. Slotmu aman sampai ada keputusan.",
  rejectedTitle: "Bukti bayar ditolak",
  rejectedBody: (reason, deadline) => `Alasan: ${reason}. Unggah bukti yang benar sebelum ${deadline}.`,
  approvedTitle: "Kamu terdaftar",
  approvedBody: "Slotmu sudah pasti. Setelah pendaftaran tutup, organizer mengacak pemain jadi tim.",
  withdraw: "Batalkan pendaftaran",
  withdrawHint: "Slotmu diberikan ke pemain berikutnya.",
  signInTitle: "Masuk untuk daftar solo",
  signInBody: "Kamu butuh akun pemain. Buat akun dulu kalau belum punya.",
  signIn: "Masuk",
  createAccount: "Buat akun pemain",
  wrongRoleTitle: "Gunakan akun Pemain",
  wrongRoleBody: "Akun ini bukan akun pemain. Keluar dari akun ini lalu masuk menggunakan akun Pemain.",
  notOpen: "Pendaftaran belum dibuka.",
  closed: "Pendaftaran sudah ditutup.",
  back: "Kembali ke halaman event",
};

const en: SoloCopy = {
  title: "Join solo",
  formIntro: "Enter your game details. If the slots are full, you join the queue and do not pay yet.",
  ign: "IGN",
  uid: "UID",
  primaryPosition: "Main position",
  pickPosition: "Pick a position",
  secondaryPosition: "Backup position",
  noSecondary: "None",
  emergencyHint: (position) => `Pick ${position} if you will step in when there are too few ${position} players.`,
  willingCaptain: "I am willing to be captain",
  whatsapp: "WhatsApp number",
  whatsappHint: "Used to reach your team and the organizer.",
  shareContact: "Teammates may see it once teams are locked",
  submit: "Join solo",
  feeNote: (fee) => `Fee ${fee}. You pay once you hold a slot.`,
  freeNote: "Free.",
  yourDetails: (ign, uid, position) => `IGN ${ign} · UID ${uid} · ${position}`,
  queuedTitle: "You are in the queue",
  queuedBody: (position, group) => `Place ${position} for ${group}. You do not pay yet, and we email you when a slot opens.`,
  queuedBodyUnknown: "You are in the queue. You do not pay yet, and we email you when a slot opens.",
  payTitle: "Pay to keep your slot",
  payBody: (deadline) => `Pay before ${deadline}. After that, the slot goes to the next player.`,
  fee: (fee) => `Fee: ${fee}`,
  scanQris: "Scan the QRIS, then upload your proof of payment.",
  qrisAlt: "Payment QRIS",
  organizerNote: "Organizer instructions",
  noQris: "The organizer has not set up a QRIS yet. Contact the organizer.",
  proofLabel: "Proof of payment",
  proofHint: "PNG, JPG or WebP image. 2 MB at most.",
  sendProof: "Send proof of payment",
  reviewTitle: "Your payment is being checked",
  reviewBody: "The organizer will check your proof. Your slot is safe until they decide.",
  rejectedTitle: "Payment proof rejected",
  rejectedBody: (reason, deadline) => `Reason: ${reason}. Upload a correct proof before ${deadline}.`,
  approvedTitle: "You are registered",
  approvedBody: "Your slot is confirmed. After registration closes, the organizer draws the players into teams.",
  withdraw: "Cancel registration",
  withdrawHint: "Your slot goes to the next player.",
  signInTitle: "Sign in to join solo",
  signInBody: "You need a player account. Create one first if you do not have it.",
  signIn: "Sign in",
  createAccount: "Create a player account",
  wrongRoleTitle: "Use a Player account",
  wrongRoleBody: "This is not a player account. Sign out, then sign in with a Player account.",
  notOpen: "Registration has not opened.",
  closed: "Registration is closed.",
  back: "Back to the event page",
};

export function soloCopy(locale: Locale): SoloCopy {
  return locale === "id" ? id : en;
}

const NOTICES: Record<Locale, Record<string, string>> = {
  id: {
    approved: "Kamu terdaftar.",
    pending_payment: "Slot kamu aman. Bayar untuk melanjutkan.",
    queued: "Slot penuh. Kamu masuk antrean.",
    "payment-proof-uploaded": "Bukti bayar terkirim. Organizer akan memeriksanya.",
    withdrawn: "Pendaftaran dibatalkan.",
    "withdrawn-refund": "Pendaftaran dibatalkan. Hubungi organizer untuk refund.",
  },
  en: {
    approved: "You are registered.",
    pending_payment: "Your slot is safe. Pay to continue.",
    queued: "The slots are full. You joined the queue.",
    "payment-proof-uploaded": "Payment proof sent. The organizer will check it.",
    withdrawn: "Registration cancelled.",
    "withdrawn-refund": "Registration cancelled. Contact the organizer for a refund.",
  },
};

/** Text for a success code from the address bar. Only known codes print; anything else is ignored. */
export function successNotice(code: string | undefined, locale: Locale): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(NOTICES[locale], code) ? NOTICES[locale][code] : null;
}

export function formatDeadline(deadline: Date | null, locale: Locale): string {
  if (!deadline) return "—";
  const tag = locale === "id" ? "id-ID" : "en-GB";
  const date = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(deadline);
  const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(deadline);
  return `${date}, ${time} WIB`;
}
