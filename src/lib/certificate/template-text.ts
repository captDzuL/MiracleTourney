// Text helpers for the certificate: team name splitting, font sizes and HTML escaping.
// Moved out of template.ts without changes (refactor Phase 4, 4d-cert).


export function splitTeamName(teamName: string): string[] {
  const clean = teamName.trim().replace(/\s+/g, " ");
  if (!clean) return ["CHAMPION"];

  const words = clean.split(" ");
  if (words.length === 1) return words;
  if (words.length === 2) return words;

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 14 || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function getForegroundTeamFontSize(teamName: string, lineCount: number) {
  if (lineCount >= 5) return 82;
  if (lineCount === 4) return 98;
  if (teamName.length >= 26) return 120;
  if (teamName.length >= 20) return 134;
  return 152;
}

export function getBackgroundTeamFontSize(teamName: string) {
  if (teamName.length >= 26) return 220;
  if (teamName.length >= 18) return 255;
  return 290;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
