// Safe loader for an existing Team.logoUrl, used to turn a team logo into an approved certificate asset.
// The URL is organizer-reachable data, so only two shapes are ever read: a Vercel Blob https URL under
// /team-logos/ on this project's own public blob host, or one /team-logos/<generated file> under public/.
// Everything else is refused before I/O.

import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { writeServerLog } from "@/lib/observability/logger";
import { CERTIFICATE_ASSET_LIMITS } from "./service";

export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export type TeamLogoImportCode =
  | "logo_missing" | "logo_unsupported_source" | "logo_fetch_failed" | "logo_too_large"
  | "unsupported_type" | "signature_mismatch";
export type TeamLogoSource =
  | { readonly kind: "blob"; readonly url: string }
  | { readonly kind: "local"; readonly segments: readonly string[] };
export type TeamLogoClassification =
  | { readonly ok: true; readonly source: TeamLogoSource }
  | { readonly ok: false; readonly code: "logo_missing" | "logo_unsupported_source" };
export type LoadedTeamLogo = { readonly bytes: Buffer; readonly mimeType: ImageMime; readonly contentSha256: string };
export type TeamLogoLoadResult =
  | { readonly ok: true; readonly logo: LoadedTeamLogo }
  | { readonly ok: false; readonly code: TeamLogoImportCode };
export type TeamLogoLoadOptions = {
  readonly fetchImpl?: typeof fetch;
  readonly publicRoot?: string;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly realpathImpl?: typeof realpath;
};

export const TEAM_LOGO_FETCH_TIMEOUT_MS = 10_000;
const MAX_SOURCE_LENGTH = 2048;
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const BLOB_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.public\.blob\.vercel-storage\.com$/;
const BLOB_TOKEN = /^vercel_blob_rw_([A-Za-z0-9]+)_[A-Za-z0-9]+$/;
const BLOB_LOGO_PATH = "/team-logos/";
const UNSAFE_CHARACTERS = /[\u0000-\u0020\u007f-\u009f\\]/;
// File names written by uploadImageAsset: <entityId>-<sha256>-<uuid>.<ext>
const LOCAL_LOGO_FILE = /^[A-Za-z0-9_-]+-[a-f0-9]{64}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/;
const UNSUPPORTED = { ok: false, code: "logo_unsupported_source" } as const;

class TeamLogoImportError extends Error {
  constructor(readonly code: TeamLogoImportCode) {
    super(code);
    this.name = "TeamLogoImportError";
  }
}

/**
 * The one blob host a logo may come from. With this project's token the host is pinned to its own store; without a
 * parseable token any Vercel Blob store is accepted outside production only. The token itself is never kept or logged.
 */
function allowedBlobHost(env: NodeJS.ProcessEnv): ((hostname: string) => boolean) | null {
  const storeId = BLOB_TOKEN.exec(env.BLOB_READ_WRITE_TOKEN ?? "")?.[1];
  if (storeId) return (hostname) => hostname === `${storeId.toLowerCase()}${BLOB_HOST_SUFFIX}`;
  return env.NODE_ENV === "production" ? null : (hostname) => BLOB_HOST.test(hostname);
}

function classifyBlobUrl(raw: string, env: NodeJS.ProcessEnv): TeamLogoClassification {
  const hostAllowed = allowedBlobHost(env);
  if (raw.includes("#") || !hostAllowed) return UNSUPPORTED;
  let url: URL;
  try { url = new URL(raw); }
  catch { return UNSUPPORTED; }
  const valid = url.protocol === "https:" && !url.username && !url.password && !url.port
    && hostAllowed(url.hostname) && url.pathname.startsWith(BLOB_LOGO_PATH) && url.pathname.length > BLOB_LOGO_PATH.length;
  return valid ? { ok: true, source: { kind: "blob", url: url.href } } : UNSUPPORTED;
}

function classifyLocalPath(raw: string): TeamLogoClassification {
  const segments = raw.slice(1).split("/");
  const valid = segments.length === 2 && segments[0] === "team-logos" && LOCAL_LOGO_FILE.test(segments[1]);
  return valid ? { ok: true, source: { kind: "local", segments } } : UNSUPPORTED;
}

/** Decides which (if any) trusted location a stored team logo URL points to. Performs no I/O. */
export function classifyTeamLogoSource(value: string | null | undefined, env: NodeJS.ProcessEnv = process.env): TeamLogoClassification {
  const raw = value?.trim() ?? "";
  if (!raw) return { ok: false, code: "logo_missing" };
  if (raw.length > MAX_SOURCE_LENGTH || UNSAFE_CHARACTERS.test(raw)) return UNSUPPORTED;
  if (raw.startsWith("/")) return classifyLocalPath(raw);
  return classifyBlobUrl(raw, env);
}

/** Identifies PNG, JPEG, or WebP from magic bytes only. */
export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  const at = (index: number) => bytes[index];
  if (bytes.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47
    && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return "image/png";
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString("ascii");
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export function parseImageContentType(header: string | null): ImageMime | null {
  const type = header?.split(";")[0]?.trim().toLowerCase();
  return type === "image/png" || type === "image/jpeg" || type === "image/webp" ? type : null;
}

const discard = (body: ReadableStream<Uint8Array> | null) => { void body?.cancel().catch(() => undefined); };

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    discard(response.body);
    throw new TeamLogoImportError("logo_too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new TeamLogoImportError("logo_fetch_failed");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new TeamLogoImportError("logo_too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function readBlobLogo(url: string, options: TeamLogoLoadOptions, maxBytes: number) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs ?? TEAM_LOGO_FETCH_TIMEOUT_MS),
    headers: { accept: "image/png,image/jpeg,image/webp" },
  });
  if (!response.ok) { discard(response.body); throw new TeamLogoImportError("logo_fetch_failed"); }
  const declaredMime = parseImageContentType(response.headers.get("content-type"));
  if (!declaredMime) { discard(response.body); throw new TeamLogoImportError("unsupported_type"); }
  return { bytes: await readBodyWithLimit(response, maxBytes), declaredMime };
}

async function readLocalLogo(segments: readonly string[], publicRoot: string, maxBytes: number, realpathImpl: typeof realpath) {
  const allowedRoot = path.resolve(publicRoot, segments[0]);
  const target = path.resolve(publicRoot, ...segments);
  if (!target.startsWith(allowedRoot + path.sep)) throw new TeamLogoImportError("logo_unsupported_source");
  const [realRoot, realTarget] = await Promise.all([realpathImpl(allowedRoot), realpathImpl(target)]);
  if (!realTarget.startsWith(realRoot + path.sep)) throw new TeamLogoImportError("logo_unsupported_source");
  const handle = await open(realTarget, "r");
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new TeamLogoImportError("logo_unsupported_source");
    if (stats.size > maxBytes) throw new TeamLogoImportError("logo_too_large");
    return { bytes: await handle.readFile(), declaredMime: null };
  } finally {
    await handle.close();
  }
}

function readSource(source: TeamLogoSource, options: TeamLogoLoadOptions, maxBytes: number) {
  return source.kind === "blob"
    ? readBlobLogo(source.url, options, maxBytes)
    : readLocalLogo(source.segments, options.publicRoot ?? path.join(process.cwd(), "public"), maxBytes, options.realpathImpl ?? realpath);
}

/** Logs only the code and the error class name: messages and stacks of network errors can contain the URL. */
function logUnexpectedFailure(error: unknown): void {
  writeServerLog({
    phase: "failed", operation: "certificate_team_logo_load", route: "/server-actions/certificate/team-logo-import",
    requestId: "team-logo-load", durationMs: 0, status: 502, errorCode: "logo_fetch_failed",
    stage: error instanceof Error ? error.name : typeof error,
  });
}

/**
 * Loads the bytes behind a stored team logo URL. Never follows redirects, caps the size while reading,
 * and returns the mime type detected from the bytes. Failures are typed codes and never carry the URL.
 */
export async function loadTeamLogo(value: string | null | undefined, options: TeamLogoLoadOptions = {}): Promise<TeamLogoLoadResult> {
  const classified = classifyTeamLogoSource(value, options.env);
  if (!classified.ok) return classified;
  const maxBytes = options.maxBytes ?? CERTIFICATE_ASSET_LIMITS.maxBytes;
  try {
    const { bytes, declaredMime } = await readSource(classified.source, options, maxBytes);
    if (bytes.length === 0 || bytes.length > maxBytes) throw new TeamLogoImportError(bytes.length ? "logo_too_large" : "logo_fetch_failed");
    const mimeType = detectImageMime(bytes);
    if (!mimeType) throw new TeamLogoImportError("unsupported_type");
    if (declaredMime && declaredMime !== mimeType) throw new TeamLogoImportError("signature_mismatch");
    return { ok: true, logo: { bytes, mimeType, contentSha256: createHash("sha256").update(bytes).digest("hex") } };
  } catch (error) {
    if (error instanceof TeamLogoImportError) return { ok: false, code: error.code };
    logUnexpectedFailure(error);
    return { ok: false, code: "logo_fetch_failed" };
  }
}
