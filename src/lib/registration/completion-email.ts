import { formatCompletionDeadline, type CompletionGaps } from "@/lib/registration/completion";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCompletionEmail(input: {
  teamName: string;
  eventName: string;
  gaps: CompletionGaps;
  deadline: Date;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const missing: string[] = [];
  if (input.gaps.missingContact) missing.push("Nomor WhatsApp kapten belum diisi.");
  if (input.gaps.missingPlayers > 0) missing.push(`Pemain kurang ${input.gaps.missingPlayers} orang.`);

  const items = missing.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const deadline = escapeHtml(formatCompletionDeadline(input.deadline));
  return {
    subject: `Lengkapi data tim ${input.teamName} sebelum ${formatCompletionDeadline(input.deadline)}`,
    html: [
      `<p>Halo kapten ${escapeHtml(input.teamName)},</p>`,
      `<p>Data tim kamu di ${escapeHtml(input.eventName)} belum lengkap:</p>`,
      `<ul>${items}</ul>`,
      `<p>Lengkapi sebelum <strong>${deadline}</strong>. Kalau terlambat, panitia bisa menangguhkan pendaftaran tim kamu dan slotnya dibuka untuk tim lain.</p>`,
      `<p><a href="${escapeHtml(input.dashboardUrl)}">Buka dashboard kapten</a></p>`,
    ].join(""),
  };
}
