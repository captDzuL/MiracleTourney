import type { BracketSlot, SocialBracketMatch, SocialBracketModel } from "./types";
import { buildBracketLayout, CARD_WIDTH, COLUMN_GAP, CARD_HEIGHT } from "./layout";

export const escapeBracketHtml = (value: string | number | null | undefined): string => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
const safeUrl = (value: string | null): string | null => {
  if (!value) return null;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  if (/^\/(?:uploads|bracket-backgrounds|team-logos|event-logos|logo)\/[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(value) && !value.includes("..") && !value.includes("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)) return url.href;
  } catch { /* unsafe image falls back to initials */ }
  return null;
};

function logo(slot: BracketSlot): string {
  const team = slot.team;
  if (!team) return '<span class="sb-placeholder-mark" aria-hidden="true">?</span>';
  const url = safeUrl(team.logoUrl);
  const fallback = `<span data-team-initials class="sb-initials">${escapeBracketHtml(team.initials || team.name.slice(0, 2))}</span>`;
  return url ? `<span class="sb-logo-wrap"><img data-team-logo src="${escapeBracketHtml(url)}" alt="" />${fallback}</span>` : fallback;
}

function teamRow(slot: BracketSlot, score: number | null, match: SocialBracketMatch, side: "home" | "away", locale: "id" | "en"): string {
  const won = Boolean(slot.team && match.winnerTeamId === slot.team.id && match.status === "completed");
  const name = slot.team?.name || slot.label || "TBD";
  return `<div class="sb-team-row${won ? " sb-team-winner" : ""}" data-side="${side}">${logo(slot)}<span class="sb-team-name">${escapeBracketHtml(name)}</span>${won ? `<span class="sb-winner-badge" aria-label="${locale === "id" ? "Pemenang" : "Winner"}">✓</span>` : ""}<span class="sb-score">${score === null ? "—" : escapeBracketHtml(score)}</span></div>`;
}

function matchCard(match: SocialBracketMatch, locale: "id" | "en", x: number, y: number, exportMode: boolean): string {
  const id = locale === "id";
  const status = ({ live: "LIVE", completed: id ? "SELESAI" : "FINAL", bye: "BYE", delayed: id ? "TERTUNDA" : "DELAYED", postponed: id ? "DITUNDA" : "POSTPONED", scheduled: id ? "TERJADWAL" : "SCHEDULED" } as Record<SocialBracketMatch["status"], string>)[match.status];
  const gameRows = match.games.map((game) => `<li>Game ${escapeBracketHtml(game.number)} <strong>${escapeBracketHtml(game.homeScore)}–${escapeBracketHtml(game.awayScore)}</strong></li>`).join("");
  const schedule = match.schedule ? `<p>${id ? "Jadwal" : "Schedule"}: <time datetime="${escapeBracketHtml(match.schedule)}">${escapeBracketHtml(match.schedule)}</time></p>` : "";
  const details = exportMode ? `<div class="sb-details sb-details-static">${match.bestOf > 1 ? `BO${escapeBracketHtml(match.bestOf)}` : ""}${schedule}<ul>${gameRows}</ul></div>` : `<details class="sb-details"><summary>${id ? "Detail pertandingan" : "Match details"}</summary><div>${match.bestOf > 1 ? `BO${escapeBracketHtml(match.bestOf)}` : ""}${schedule}<ul>${gameRows}</ul></div></details>`;
  return `<article class="sb-match" data-match-id="${escapeBracketHtml(match.id)}" data-round-key="${escapeBracketHtml(match.roundKey)}" style="left:${x}px;top:${y}px"><div class="sb-match-head"><span>${escapeBracketHtml(match.roundLabel)}</span><span class="sb-status${match.status === "live" ? " sb-live" : ""}">${status}</span></div>${teamRow(match.home, match.homeScore, match, "home", locale)}${teamRow(match.away, match.awayScore, match, "away", locale)}${details}</article>`;
}

export function getChampionMatch(model: SocialBracketModel): SocialBracketMatch | null {
  if (!model.champion || /round[_ -]?robin|league/i.test(model.event.format)) return null;
  const downstream = new Set(model.matches.flatMap((match) => [match.home.sourceMatchId, match.away.sourceMatchId]).filter((id): id is string => Boolean(id)));
  const lastRound = new Map<string, number>();
  for (const match of model.matches) lastRound.set(match.bracket, Math.max(lastRound.get(match.bracket) ?? 0, match.round));
  const finals = model.matches.filter((match) => match.status === "completed" && match.winnerTeamId === model.champion?.id && match.homeScore !== null && match.awayScore !== null && !downstream.has(match.id) && (/grand[_-]?final/i.test(match.bracket) || (/single|upper|playoff/i.test(match.bracket) && match.round === lastRound.get(match.bracket))));
  return finals.sort((a, b) => Number(/grand[_-]?final/i.test(b.bracket)) - Number(/grand[_-]?final/i.test(a.bracket)) || b.round - a.round)[0] ?? null;
}

export function renderBracketCanvasHtml(model: SocialBracketModel, roundKey?: string, options: { exportMode?: boolean } = {}): string {
  const layout = buildBracketLayout(model.matches, roundKey);
  const locale = model.locale;
  const id = locale === "id";
  const path = layout.edges.map((edge) => {
    const source = layout.positions.get(edge.sourceId)!;
    const target = layout.positions.get(edge.targetId)!;
    const sx = source.x + CARD_WIDTH;
    const sy = source.y + CARD_HEIGHT / 2;
    const tx = target.x;
    const ty = target.y + (edge.targetSlot === "home" ? 41 : 79);
    const mid = sx + Math.max(14, (tx - sx) / 2);
    return `<path data-source-id="${escapeBracketHtml(edge.sourceId)}" data-target-id="${escapeBracketHtml(edge.targetId)}" d="M${sx} ${sy} H${mid} V${ty} H${tx}" />`;
  }).join("");
  const cards = layout.rounds.flatMap((round) => round.matches.map((match) => { const position = layout.positions.get(match.id)!; return matchCard(match, locale, position.x, position.y, Boolean(options.exportMode)); })).join("");
  const rounds = layout.rounds.map((round) => { const y = Math.min(...round.matches.map((match) => layout.positions.get(match.id)?.y ?? 0)); return `<div class="sb-round-heading" style="left:${(layout.columns.get(round.key) ?? 0) * (CARD_WIDTH + COLUMN_GAP)}px;top:${y}px">${escapeBracketHtml(round.label)}</div>`; }).join("");
  const winningMatch = getChampionMatch(model);
  const result = winningMatch ? `${winningMatch.homeScore}-${winningMatch.awayScore}` : null;
  const championVisible = Boolean(model.champion && (!roundKey || winningMatch?.roundKey === roundKey));
  const anchor = winningMatch && layout.positions.has(winningMatch.id) ? layout.positions.get(winningMatch.id)! : [...layout.positions.values()].sort((a, b) => b.x - a.x || a.y - b.y)[0] ?? { x: 0, y: 0 };
  const championTop = anchor.y + CARD_HEIGHT + 28;
  const championWidth = roundKey ? Math.min(CARD_WIDTH, layout.width - anchor.x) : 320;
  const canvasWidth = championVisible ? Math.max(layout.width, anchor.x + championWidth) : layout.width;
  const champion = championVisible ? `<aside class="sb-champion" style="left:${anchor.x}px;top:${championTop + 43}px;width:${championWidth}px"><svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h14v8a7 7 0 0 1-14 0V4Z"/><path d="M9 7H5v4a5 5 0 0 0 5 5M23 7h4v4a5 5 0 0 1-5 5M16 19v5M11 28h10M12 24h8v4h-8z"/></svg>${logo({ team: model.champion!, label: model.champion!.name, sourceMatchId: null, outcome: null })}<div><span>${id ? "JUARA TURNAMEN" : "TOURNAMENT CHAMPION"}</span><strong>${escapeBracketHtml(model.champion!.name)}</strong>${result ? `<small>${id ? "Hasil final" : "Final result"} ${result}</small>` : ""}</div></aside>` : "";
  const canvasHeight = Math.max(layout.height, championVisible ? championTop + 112 : 0) + 46;
  return `<div class="sb-canvas" data-bracket-canvas style="width:${canvasWidth}px;height:${canvasHeight}px"><div class="sb-round-headings">${rounds}</div><svg class="sb-connectors" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true">${path}</svg><div class="sb-cards">${cards}</div>${champion}</div>`;
}


export function renderBracketHeaderHtml(model: SocialBracketModel): string {
  const id = model.locale === "id";
  const formatKey = model.event.format.toLowerCase().trim().replace(/[ -]+/g, "_");
  const format = ({ single_elimination: id ? "Sistem gugur" : "Single elimination", double_elimination: id ? "Gugur ganda" : "Double elimination", round_robin: id ? "Liga" : "Round robin", group_playoffs: id ? "Grup dan playoff" : "Groups and playoffs" } as Record<string, string>)[formatKey] ?? model.event.format.replaceAll("_", " ");
  const statusKey = model.event.status.toLowerCase().trim();
  const status = ({ finished: id ? "Selesai" : "Finished", ongoing: id ? "Berlangsung" : "Ongoing", draft: id ? "Draf" : "Draft", published: id ? "Diterbitkan" : "Published" } as Record<string, string>)[statusKey] ?? model.event.status;
  const logoUrl = safeUrl(model.event.logoUrl);
  const fallback = `<span class="sb-event-fallback" aria-hidden="true">${escapeBracketHtml(model.event.name.slice(0, 1).toUpperCase())}</span>`;
  const logo = logoUrl ? `<span class="sb-event-logo-wrap"><img data-team-logo class="sb-event-logo" src="${escapeBracketHtml(logoUrl)}" alt="" />${fallback}</span>` : fallback;
  return `<header class="sb-header">${logo}<div class="sb-header-copy"><p class="sb-eyebrow">${model.preview ? (id ? "PRATINJAU BRACKET" : "DRAFT BRACKET PREVIEW") : (id ? "BRACKET RESMI" : "OFFICIAL BRACKET")}</p><h2>${escapeBracketHtml(model.event.name)}</h2><p class="sb-event-meta">${escapeBracketHtml(format)} · ${escapeBracketHtml(status)}</p>${model.champion ? `<p class="sb-header-champion">${id ? "JUARA RESMI" : "OFFICIAL CHAMPION"} · ${escapeBracketHtml(model.champion.name)}</p>` : ""}<p>${id ? "Ikuti perjalanan setiap tim menuju gelar juara." : "Follow every team's route to the title."}</p></div>${model.preview ? `<span class="sb-preview-label">${id ? "PRATINJAU" : "DRAFT PREVIEW"}</span>` : ""}</header>`;
}

export function bracketSafeAssetUrl(value: string | null): string | null { return safeUrl(value); }
