import { readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { Browser } from "playwright-core";
import type { SocialBracketModel } from "./types";
import { buildBracketLayout, CARD_WIDTH, COLUMN_GAP } from "./layout";
import { renderBracketCanvasHtml, renderBracketHeaderHtml, getChampionMatch } from "./markup";

const MAX_SIDE = 16_000;
const MAX_PIXELS = 64_000_000;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export class BracketExportTooLargeError extends Error { constructor() { super("Bracket is too large for a full PNG. Select a round."); } }

export function getBracketExportDimensions(roundKeys: string[], contentHeight: number, options: { compact?: boolean; hasChampion?: boolean } = {}): { width: number; height: number } {
  const width = options.compact ? Math.max(480, roundKeys.length * (CARD_WIDTH + COLUMN_GAP) + 96) : Math.max(960, roundKeys.length * (CARD_WIDTH + COLUMN_GAP) + 96);
  const height = options.compact ? Math.max(460, contentHeight + (options.hasChampion ? 330 : 230)) : Math.max(620, contentHeight + 320);
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) throw new BracketExportTooLargeError();
  return { width, height };
}

export function sanitizeBracketAssetUrl(value: string | null): string | null {
  if (!value || value.includes("\\")) return null;
  if (/^\/(?:uploads|bracket-backgrounds|team-logos|event-logos|logo)\/[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(value) && !value.includes("..") && !value.includes("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) return null;
    if (!/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)) return null;
    if (!/^\/[a-zA-Z0-9_./-]+$/.test(url.pathname) || url.pathname.includes("..")) return null;
    return url.href;
  } catch { return null; }
}

function publicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 || a === 192 && b === 0 && c === 2 || a === 198 && b >= 18 && b <= 19 || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113);
}

async function validatedImageData(bytes: Buffer, type: string): Promise<string | null> {
  if (bytes.length > MAX_ASSET_BYTES) return null;
  try {
    const metadata = await sharp(bytes).metadata();
    const expected = type === "image/jpeg" ? "jpeg" : type === "image/png" ? "png" : "webp";
    if (metadata.format !== expected || !metadata.width || !metadata.height) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch { return null; }
}

async function remoteImageData(url: URL): Promise<string | null> {
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(({ address }) => !publicIpv4(address))) return null;
  const selected = addresses[0];
  return await new Promise((resolve) => {
    const req = httpsRequest(url, { method: "GET", timeout: 8000, lookup: (_host, _options, callback) => callback(null, selected.address, 4) }, (response) => {
      const type = response.headers["content-type"]?.split(";")[0].trim() ?? "";
      if (response.statusCode !== 200 || !["image/png", "image/jpeg", "image/webp"].includes(type) || Number(response.headers["content-length"] ?? 0) > MAX_ASSET_BYTES) { response.resume(); resolve(null); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_ASSET_BYTES) response.destroy(); else chunks.push(chunk); });
      response.on("end", async () => resolve(size <= MAX_ASSET_BYTES ? await validatedImageData(Buffer.concat(chunks), type) : null));
      response.on("error", () => resolve(null));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

async function inlineImage(value: string | null): Promise<string | null> {
  const safe = sanitizeBracketAssetUrl(value);
  if (!safe) return null;
  try {
    if (safe.startsWith("/")) {
      const root = await realpath(resolve(process.cwd(), "public"));
      const path = await realpath(resolve(root, safe.slice(1)));
      if (!path.startsWith(root + sep)) return null;
      const bytes = await readFile(path);
      if (bytes.length > MAX_ASSET_BYTES) return null;
      const type = safe.endsWith(".png") ? "image/png" : safe.endsWith(".webp") ? "image/webp" : /\.jpe?g$/i.test(safe) ? "image/jpeg" : null;
      return type ? await validatedImageData(bytes, type) : null;
    }
    return await remoteImageData(new URL(safe));
  } catch { return null; }
}

async function withInlinedAssets(model: SocialBracketModel): Promise<SocialBracketModel> {
  const urls = new Set<string>();
  for (const url of [model.event.logoUrl, model.appearance.backgroundUrl, model.champion?.logoUrl, ...model.matches.flatMap((match) => [match.home.team?.logoUrl, match.away.team?.logoUrl])]) if (url) urls.add(url);
  const resolved = new Map(await Promise.all([...urls].map(async (url) => [url, await inlineImage(url)] as const)));
  const replace = (url: string | null | undefined) => url ? resolved.get(url) ?? null : null;
  const team = (value: typeof model.champion) => value ? { ...value, logoUrl: replace(value.logoUrl) } : null;
  return { ...model,
    event: { ...model.event, logoUrl: replace(model.event.logoUrl) },
    appearance: { ...model.appearance, backgroundUrl: replace(model.appearance.backgroundUrl) },
    champion: team(model.champion),
    matches: model.matches.map((match) => ({ ...match, home: { ...match.home, team: team(match.home.team) }, away: { ...match.away, team: team(match.away.team) } })),
  };
}

export type BracketBrowser = Pick<Browser, "newPage" | "close">;
export type BracketExportDependencies = { launchBrowser?: () => Promise<BracketBrowser> };

export async function renderSocialBracketPng(model: SocialBracketModel, roundKey?: string, dependencies: BracketExportDependencies = {}): Promise<Buffer> {
  if (roundKey && !model.matches.some((match) => match.roundKey === roundKey)) throw new Error("Unknown bracket round");
  const layout = buildBracketLayout(model.matches, roundKey);
  const hasChampion = Boolean(model.champion && (!roundKey || getChampionMatch(model)?.roundKey === roundKey));
  const dimensions = getBracketExportDimensions(layout.rounds.map((round) => round.key), layout.height + 40, { compact: Boolean(roundKey), hasChampion });
  const safeModel = await withInlinedAssets(model);
  const stylesheet = await readFile(join(process.cwd(), "src/components/v3/public-event/social-bracket.css"), "utf8");
  const [font400, font600, font800] = await Promise.all([
    readFile(join(process.cwd(), "public/mockup-public-v3/fonts/montserrat-400.woff2")),
    readFile(join(process.cwd(), "public/mockup-public-v3/fonts/montserrat-600.woff2")),
    readFile(join(process.cwd(), "public/mockup-public-v3/fonts/montserrat-800.woff2")),
  ]);
  const fontCss = [[400, font400], [600, font600], [800, font800]].map(([weight, bytes]) => `@font-face{font-family:Montserrat;src:url(data:font/woff2;base64,${(bytes as Buffer).toString("base64")}) format("woff2");font-weight:${weight};font-style:normal}`).join("");
  const background = safeModel.appearance.backgroundUrl ? `background-image:linear-gradient(rgba(9,17,30,${Math.min(1, Math.max(0, safeModel.appearance.overlay / 100))}),rgba(9,17,30,${Math.min(1, Math.max(0, safeModel.appearance.overlay / 100))})),url('${safeModel.appearance.backgroundUrl}');background-size:cover;background-position:${safeModel.appearance.positionX}% ${safeModel.appearance.positionY}%;` : "";
  const watermark = model.preview ? `<div class="sb-export-watermark">${model.locale === "id" ? "PRATINJAU" : "DRAFT PREVIEW"}</div>` : "";
  const legend = model.locale === "id" ? "Garis: jalur pertandingan · LIVE: berlangsung · ✓: pemenang" : "Line: match progression · LIVE: in progress · ✓: winner";
  const html = `<!doctype html><html lang="${model.locale}"><head><meta charset="utf-8"><style>${fontCss}${stylesheet}html,body{margin:0;background:#09111E}.social-bracket{width:${dimensions.width}px;height:${dimensions.height}px;border-radius:0;box-shadow:none;overflow:hidden;${background}}.sb-export-watermark{position:absolute;inset:40% 0 auto;text-align:center;transform:rotate(-18deg);color:#ffe7ae80;font:800 clamp(30px,8vw,90px) Montserrat,Arial,sans-serif;pointer-events:none;z-index:5}</style></head><body><main class="social-bracket miracle-v3" style="position:relative">${renderBracketHeaderHtml(safeModel)}${renderBracketCanvasHtml(safeModel, roundKey, { exportMode: true })}<p class="sb-export-legend">${legend}</p>${watermark}</main></body></html>`;
  const browser = dependencies.launchBrowser ? await dependencies.launchBrowser() : await (await import("@/lib/certificate/browser")).launchCertificateBrowser();
  try {
    const page = await browser.newPage();
    try {
      await page.setViewportSize({ width: dimensions.width, height: dimensions.height });
      await page.route("**/*", (route) => route.abort());
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(async () => {
        await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]);
        await Promise.all(Array.from(document.images).map(async (image) => {
          const loaded = await image.decode().then(() => image.naturalWidth > 0, () => false);
          if (!loaded) image.remove();
        }));
      });
      const bytes = await page.screenshot({ type: "png", fullPage: false });
      return Buffer.from(bytes);
    } finally { await page.close(); }
  } finally { await browser.close(); }
}
