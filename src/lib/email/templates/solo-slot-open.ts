export type SoloSlotOpenEmailInput = {
  playerName: string;
  eventName: string;
  eventUrl: string;
  status: "pending_payment" | "approved";
  /** Payment deadline. Required when the player still has to pay. */
  deadline: Date | null;
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
const stripMarkup = (value: string) => value.replace(/[<>\r\n]/g, " ").trim();

function formatDeadline(deadline: Date): string {
  const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(deadline);
  const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(deadline);
  return `${date}, ${time} WIB`;
}

/**
 * The mail sent when a queued player gets a slot. Indonesian only; the person has not picked a
 * language for mail. Player and event names are escaped because players type them.
 */
export function soloSlotOpenEmail(input: SoloSlotOpenEmailInput): { subject: string; html: string } {
  if (!/^https?:\/\//i.test(input.eventUrl)) throw new Error("The event url must start with http or https.");
  if (input.status === "pending_payment" && !input.deadline) throw new Error("A payment email needs a deadline.");

  const name = escapeHtml(input.playerName);
  const event = escapeHtml(input.eventName);
  const link = escapeHtml(input.eventUrl);
  const button = `<p><a href="${link}">Buka halaman pendaftaran</a></p>`;

  if (input.status === "approved") {
    return {
      subject: `Kamu terdaftar: ${stripMarkup(input.eventName)}`,
      html: `<p>Halo ${name},</p><p>Ada slot kosong di ${event} dan sekarang jadi milikmu. Kamu sudah terdaftar.</p>${button}`,
    };
  }
  return {
    subject: `Slot kamu terbuka: ${stripMarkup(input.eventName)}`,
    html: `<p>Halo ${name},</p><p>Ada slot kosong di ${event} dan sekarang jadi milikmu.</p>`
      + `<p>Bayar sebelum ${escapeHtml(formatDeadline(input.deadline as Date))}. Lewat dari itu, slot diberikan ke pemain berikutnya.</p>${button}`,
  };
}
