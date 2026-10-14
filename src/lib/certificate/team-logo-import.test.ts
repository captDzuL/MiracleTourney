import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyTeamLogoSource,
  detectImageMime,
  loadTeamLogo,
  parseImageContentType,
  TEAM_LOGO_FETCH_TIMEOUT_MS,
} from "./team-logo-import";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-body")]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jpeg-body")]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const HOST = "abc123def.public.blob.vercel-storage.com";
const LOGO_PATH = "/team-logos/team-1-hash-uuid.png";
const BLOB_URL = `https://${HOST}${LOGO_PATH}`;
const DEV = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
const PRODUCTION = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
const SECRET = "s3cr3tS3cr3tS3cr3t";
const pinned = (storeId: string, nodeEnv = "production") => ({ NODE_ENV: nodeEnv, BLOB_READ_WRITE_TOKEN: `vercel_blob_rw_${storeId}_${SECRET}` }) as NodeJS.ProcessEnv;
const SHA = "a".repeat(64);
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const localName = (extension = "png") => `team-1-${SHA}-${UUID}.${extension}`;

// Creating a file symlink needs a privilege on Windows; the test that needs one is reported as skipped without it.
const canSymlink = await (async () => {
  const probeDir = await mkdtemp(path.join(os.tmpdir(), "team-logo-symlink-probe-"));
  try { await symlink(path.join(probeDir, "target"), path.join(probeDir, "link"), "file"); return true; }
  catch { return false; }
  finally { await rm(probeDir, { recursive: true, force: true }); }
})();

const okResponse = (body: Buffer | string, type = "image/png", extra: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : new Uint8Array(body), { status: 200, headers: { "content-type": type, ...extra } });

describe("classifyTeamLogoSource", () => {
  it.each([null, undefined, "", "   "])("treats %j as a missing logo", (value) => {
    expect(classifyTeamLogoSource(value, DEV)).toEqual({ ok: false, code: "logo_missing" });
  });

  it("accepts a Vercel Blob https URL under /team-logos/ and returns the normalized href", () => {
    expect(classifyTeamLogoSource(` ${BLOB_URL} `, DEV)).toEqual({ ok: true, source: { kind: "blob", url: BLOB_URL } });
  });

  it.each([
    `https://evil.com/.public.blob.vercel-storage.com${LOGO_PATH}`,
    `https://evil.com${LOGO_PATH}#.public.blob.vercel-storage.com`,
    `https://evil.com?x=.public.blob.vercel-storage.com${LOGO_PATH}`,
    `https://abc.public.blob.vercel-storage.com@evil.com${LOGO_PATH}`,
    `https://evil.com\\.public.blob.vercel-storage.com${LOGO_PATH}`,
    `https://abc.public.blob.vercel-storage.com.evil.com${LOGO_PATH}`,
    `https://evilpublic.blob.vercel-storage.com${LOGO_PATH}`,
    `https://public.blob.vercel-storage.com${LOGO_PATH}`,
    `https://a.b.public.blob.vercel-storage.com${LOGO_PATH}`,
    `https://abc.public.blob.vercel-storage.com.${LOGO_PATH}`,
    `https://user:pass@${HOST}${LOGO_PATH}`,
    `https://user@${HOST}${LOGO_PATH}`,
    `https://${HOST}:8443${LOGO_PATH}`,
    `https://${HOST}${LOGO_PATH}#frag`,
    `https://${HOST}${LOGO_PATH}#`,
    `http://${HOST}${LOGO_PATH}`,
    `ftp://${HOST}${LOGO_PATH}`,
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    `https://127.0.0.1${LOGO_PATH}`,
    "https://169.254.169.254/latest/meta-data",
    `https://[::1]${LOGO_PATH}`,
    `https://2130706433${LOGO_PATH}`,
    `https://0x7f.0.0.1${LOGO_PATH}`,
    `https://localhost${LOGO_PATH}`,
    `//${HOST}${LOGO_PATH}`,
    `${HOST}${LOGO_PATH}`,
    `https://${HOST}/team-logos/a\n.png`,
    `https://${HOST}/team-logos/a b.png`,
    `https://${HOST}/`,
    `https://${HOST}`,
    `https://${HOST}/team-logos/`,
    `https://${HOST}/team-logos`,
    `https://${HOST}/uploads/a.png`,
    `https://${HOST}/certificate-assets/a.png`,
    `https://${HOST}/other/team-logos/a.png`,
    `https://${HOST}/team-logos/${"a".repeat(2100)}.png`,
  ])("rejects %j as an unsupported source", (value) => {
    expect(classifyTeamLogoSource(value, DEV)).toEqual({ ok: false, code: "logo_unsupported_source" });
  });

  it("fetches only the normalized host when the host is written with encoded dots", () => {
    expect(classifyTeamLogoSource(`https://abc123def%2Epublic.blob.vercel-storage.com${LOGO_PATH}`, DEV))
      .toEqual({ ok: true, source: { kind: "blob", url: BLOB_URL } });
    expect(classifyTeamLogoSource(`https://evil.com%2F.public.blob.vercel-storage.com${LOGO_PATH}`, DEV))
      .toEqual({ ok: false, code: "logo_unsupported_source" });
    expect(classifyTeamLogoSource(`https://${HOST}%2F@evil.com${LOGO_PATH}`, DEV))
      .toEqual({ ok: false, code: "logo_unsupported_source" });
  });

  describe("pinning to this project's blob store", () => {
    it("accepts only the store named in BLOB_READ_WRITE_TOKEN, matched case-insensitively", () => {
      expect(classifyTeamLogoSource(BLOB_URL, pinned("abc123def"))).toEqual({ ok: true, source: { kind: "blob", url: BLOB_URL } });
      expect(classifyTeamLogoSource(BLOB_URL, pinned("AbC123DeF"))).toEqual({ ok: true, source: { kind: "blob", url: BLOB_URL } });
    });

    it("rejects a logo from any other blob store", () => {
      expect(classifyTeamLogoSource(BLOB_URL, pinned("otherstore"))).toEqual({ ok: false, code: "logo_unsupported_source" });
      expect(classifyTeamLogoSource(BLOB_URL, pinned("abc123", "development"))).toEqual({ ok: false, code: "logo_unsupported_source" });
      expect(classifyTeamLogoSource(`https://xabc123def.public.blob.vercel-storage.com${LOGO_PATH}`, pinned("abc123def"))).toEqual({ ok: false, code: "logo_unsupported_source" });
    });

    it("rejects a path outside /team-logos/ even on the pinned store", () => {
      for (const outside of ["/certificate-assets/a.png", "/uploads/a.png", "/a.png", "/team-logos", "/team-logosx/a.png"]) {
        expect(classifyTeamLogoSource(`https://${HOST}${outside}`, pinned("abc123def"))).toEqual({ ok: false, code: "logo_unsupported_source" });
      }
    });

    it("refuses every blob URL in production without a parseable token", () => {
      for (const env of [PRODUCTION, { ...PRODUCTION, BLOB_READ_WRITE_TOKEN: "" }, { ...PRODUCTION, BLOB_READ_WRITE_TOKEN: "not-a-blob-token" }, { ...PRODUCTION, BLOB_READ_WRITE_TOKEN: "vercel_blob_rw__secret" }]) {
        expect(classifyTeamLogoSource(BLOB_URL, env)).toEqual({ ok: false, code: "logo_unsupported_source" });
      }
    });

    it("falls back to any Vercel Blob store outside production when the token is absent or unparseable", () => {
      for (const env of [DEV, { NODE_ENV: "test" }, {}, { NODE_ENV: "development", BLOB_READ_WRITE_TOKEN: "garbage" }] as NodeJS.ProcessEnv[]) {
        expect(classifyTeamLogoSource(BLOB_URL, env)).toEqual({ ok: true, source: { kind: "blob", url: BLOB_URL } });
      }
    });

    it("never puts the token in a classification result", () => {
      const results = [classifyTeamLogoSource(BLOB_URL, pinned("abc123def")), classifyTeamLogoSource(BLOB_URL, pinned("other"))];
      expect(JSON.stringify(results)).not.toContain(SECRET);
    });
  });

  it.each([
    [`/team-logos/${localName("png")}`],
    [`/team-logos/${localName("jpg")}`],
    [`/team-logos/${localName("webp")}`],
  ])("accepts the generated local logo %s", (value) => {
    expect(classifyTeamLogoSource(value, PRODUCTION)).toEqual({ ok: true, source: { kind: "local", segments: ["team-logos", value.split("/")[2]] } });
  });

  it.each([
    "/team-logos/../.env",
    "/team-logos/..%2f..%2f.env",
    "/team-logos/%2e%2e/secret.png",
    `/team-logos/a/../${localName()}`,
    `/team-logos/./${localName()}`,
    `/team-logos//${localName()}`,
    `/team-logos/sub/${localName()}`,
    `/team-logos/a\\..\\${localName()}`,
    `/team-logos/${localName()}?x=1`,
    `/team-logos/${localName()}#x`,
    `/team-logos/${localName()}/`,
    `/team-logos/${localName("png")}%00.svg`,
    `/team-logos/${localName("jpeg")}`,
    `/team-logos/${localName("svg")}`,
    `/team-logos/${localName("png").toUpperCase()}`,
    `/team-logos/team-1-${"A".repeat(64)}-${UUID}.png`,
    `/team-logos/team-1-${"a".repeat(63)}-${UUID}.png`,
    `/team-logos/team-1-${SHA}-not-a-uuid.png`,
    `/team-logos/${SHA}-${UUID}.png`,
    "/team-logos/",
    "/team-logos/team-1.png",
    "/team-logos/.hidden.png",
    `/uploads/${localName()}`,
    "/uploads/teams/logo.png",
    "/uploads",
    "/logo/miracle.png",
    `/certificate-assets/${localName()}`,
    `/api/secret/${localName()}`,
    `/TEAM-LOGOS/${localName()}`,
    `/team-logosx/${localName()}`,
    `team-logos/${localName()}`,
    `./team-logos/${localName()}`,
    `../team-logos/${localName()}`,
    `/team-logos/\u0000${localName()}`,
    "/team-logos/é.png",
  ])("rejects the local path %j", (value) => {
    expect(classifyTeamLogoSource(value, DEV)).toEqual({ ok: false, code: "logo_unsupported_source" });
  });
});

describe("detectImageMime and parseImageContentType", () => {
  it("detects PNG, JPEG, and WebP from magic bytes only", () => {
    expect(detectImageMime(PNG)).toBe("image/png");
    expect(detectImageMime(JPEG)).toBe("image/jpeg");
    expect(detectImageMime(WEBP)).toBe("image/webp");
    expect(detectImageMime(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageMime(Buffer.from("GIF89a"))).toBeNull();
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
  });

  it("accepts only png, jpeg, and webp content types and ignores parameters and case", () => {
    expect(parseImageContentType("image/PNG; charset=binary")).toBe("image/png");
    expect(parseImageContentType("image/jpeg")).toBe("image/jpeg");
    expect(parseImageContentType(" image/webp ")).toBe("image/webp");
    for (const bad of ["text/html", "image/svg+xml", "image/gif", "application/octet-stream", "", null]) {
      expect(parseImageContentType(bad)).toBeNull();
    }
  });
});

describe("loadTeamLogo from Vercel Blob", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("fetches without redirects or caching, with a timeout signal, and returns bytes, mime, and sha256", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(PNG));
    const result = await loadTeamLogo(BLOB_URL, { fetchImpl, env: DEV });
    expect(result).toEqual({ ok: true, logo: { bytes: PNG, mimeType: "image/png", contentSha256: createHash("sha256").update(PNG).digest("hex") } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(BLOB_URL);
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.credentials).toBeUndefined();
    expect(init.headers).not.toHaveProperty("authorization");
  });

  it("never fetches an unsupported source or a foreign store", async () => {
    const fetchImpl = vi.fn();
    await expect(loadTeamLogo("https://evil.com/team-logos/x.png", { fetchImpl, env: DEV })).resolves.toEqual({ ok: false, code: "logo_unsupported_source" });
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl, env: pinned("otherstore") })).resolves.toEqual({ ok: false, code: "logo_unsupported_source" });
    await expect(loadTeamLogo(null, { fetchImpl, env: DEV })).resolves.toEqual({ ok: false, code: "logo_missing" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps a redirect (fetch rejects), a network error, and a non-2xx status to logo_fetch_failed", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const redirect = vi.fn().mockRejectedValue(new TypeError("fetch failed: unexpected redirect"));
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: redirect, env: DEV })).resolves.toEqual({ ok: false, code: "logo_fetch_failed" });
    const notFound = vi.fn().mockResolvedValue(new Response("nope", { status: 404, headers: { "content-type": "image/png" } }));
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: notFound, env: DEV })).resolves.toEqual({ ok: false, code: "logo_fetch_failed" });
    const redirectStatus = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: redirectStatus, env: DEV })).resolves.toEqual({ ok: false, code: "logo_fetch_failed" });
  });

  it("gives up when the response headers never arrive", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const hang = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: hang, env: DEV, timeoutMs: 20 })).resolves.toEqual({ ok: false, code: "logo_fetch_failed" });
    expect(TEAM_LOGO_FETCH_TIMEOUT_MS).toBe(10_000);
  });

  it("gives up when the body stalls after the headers, through the same abort signal", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    let aborted = false;
    const stall = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(PNG.subarray(0, 4)));
          init.signal?.addEventListener("abort", () => { aborted = true; controller.error(init.signal?.reason); });
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "image/png" } });
    });
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: stall, env: DEV, timeoutMs: 20 })).resolves.toEqual({ ok: false, code: "logo_fetch_failed" });
    expect(aborted).toBe(true);
  });

  it("rejects non-image content types and svg", async () => {
    for (const type of ["text/html", "image/svg+xml", "application/json", ""]) {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse(PNG, type));
      await expect(loadTeamLogo(BLOB_URL, { fetchImpl, env: DEV })).resolves.toEqual({ ok: false, code: "unsupported_type" });
    }
  });

  it("rejects bytes that do not match the declared type or are not an image at all", async () => {
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(okResponse(JPEG, "image/png")), env: DEV }))
      .resolves.toEqual({ ok: false, code: "signature_mismatch" });
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(okResponse("<html>", "image/png")), env: DEV }))
      .resolves.toEqual({ ok: false, code: "unsupported_type" });
  });

  it("rejects an empty body", async () => {
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(okResponse("")), env: DEV }))
      .resolves.toEqual({ ok: false, code: "logo_fetch_failed" });
  });

  it("refuses an oversized declared Content-Length without reading the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const response = new Response(body, { headers: { "content-type": "image/png", "content-length": "11" } });
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(response), env: DEV, maxBytes: 10 }))
      .resolves.toEqual({ ok: false, code: "logo_too_large" });
    expect(cancel).toHaveBeenCalled();
  });

  it("enforces the cap while streaming when Content-Length is absent or lies", async () => {
    const chunk = new Uint8Array(6).fill(1);
    const cancel = vi.fn();
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({ pull(controller) { pulls += 1; controller.enqueue(chunk); }, cancel });
    const response = new Response(endless, { headers: { "content-type": "image/png", "content-length": "5" } });
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(response), env: DEV, maxBytes: 10 }))
      .resolves.toEqual({ ok: false, code: "logo_too_large" });
    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThan(5);
  });

  it("accepts a body of exactly the cap and defaults to the 5 MB certificate limit", async () => {
    const exact = Buffer.concat([PNG, Buffer.alloc(32 - PNG.length)]);
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(okResponse(exact)), env: DEV, maxBytes: 32 }))
      .resolves.toMatchObject({ ok: true });
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1)]);
    await expect(loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(okResponse(big)), env: DEV }))
      .resolves.toEqual({ ok: false, code: "logo_too_large" });
  });

  describe("logging of unexpected failures", () => {
    it("logs only the code and the error class, never the URL, its host, the message, or the token", async () => {
      const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const secretUrl = `${BLOB_URL}?token=${SECRET}`;
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError(`fetch failed for ${secretUrl} using ${SECRET}`));
      await expect(loadTeamLogo(secretUrl, { fetchImpl, env: pinned("abc123def") })).resolves.toEqual({ ok: false, code: "logo_fetch_failed" });
      const lines = [...info.mock.calls, ...error.mock.calls, ...warn.mock.calls].map(([line]) => String(line));
      expect(lines).toHaveLength(1);
      const record = JSON.parse(lines[0]);
      expect(record).toMatchObject({ phase: "failed", errorCode: "logo_fetch_failed", stage: "typeerror" });
      for (const forbidden of [SECRET, "abc123def", "team-logos", "https", "fetch failed"]) expect(lines[0]).not.toContain(forbidden);
    });

    it("does not log expected, typed failures", async () => {
      const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
      await loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(new Response("gone", { status: 404 })), env: DEV });
      await loadTeamLogo(BLOB_URL, { fetchImpl: vi.fn().mockResolvedValue(okResponse("<html>")), env: DEV });
      expect(info).not.toHaveBeenCalled();
    });
  });
});

describe("loadTeamLogo from the local public directory", () => {
  let root: string;
  const file = localName("png");
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "team-logo-import-"));
    await mkdir(path.join(root, "team-logos"), { recursive: true });
    await writeFile(path.join(root, "team-logos", file), PNG);
    await writeFile(path.join(root, "team-logos", localName("jpg")), JPEG);
    await writeFile(path.join(root, "team-logos", localName("webp").replace("team-1", "html")), "<html>");
    await writeFile(path.join(root, "team-logos", localName("webp").replace("team-1", "big")), Buffer.concat([PNG, Buffer.alloc(64)]));
    await writeFile(path.join(root, "secret.png"), PNG);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it("reads an allowed file and detects the mime from its bytes", async () => {
    const fetchImpl = vi.fn();
    await expect(loadTeamLogo(`/team-logos/${file}`, { publicRoot: root, fetchImpl, env: DEV })).resolves.toMatchObject({ ok: true, logo: { mimeType: "image/png", bytes: PNG } });
    await expect(loadTeamLogo(`/team-logos/${localName("jpg")}`, { publicRoot: root, fetchImpl, env: DEV })).resolves.toMatchObject({ ok: true, logo: { mimeType: "image/jpeg" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a missing file, a non-image file, and an oversized file", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(loadTeamLogo(`/team-logos/${localName("png").replace("team-1", "missing")}`, { publicRoot: root, env: DEV })).resolves.toEqual({ ok: false, code: "logo_fetch_failed" });
    await expect(loadTeamLogo(`/team-logos/${localName("webp").replace("team-1", "html")}`, { publicRoot: root, env: DEV })).resolves.toEqual({ ok: false, code: "unsupported_type" });
    await expect(loadTeamLogo(`/team-logos/${localName("webp").replace("team-1", "big")}`, { publicRoot: root, env: DEV, maxBytes: 32 })).resolves.toEqual({ ok: false, code: "logo_too_large" });
  });

  it("refuses traversal and the removed /uploads root before touching the disk", async () => {
    const realpathImpl = vi.fn();
    for (const value of ["/team-logos/../secret.png", `/uploads/${file}`]) {
      await expect(loadTeamLogo(value, { publicRoot: root, env: DEV, realpathImpl })).resolves.toEqual({ ok: false, code: "logo_unsupported_source" });
    }
    expect(realpathImpl).not.toHaveBeenCalled();
  });

  it("refuses a file whose real path leaves the logo directory", async () => {
    const realpathImpl = vi.fn().mockImplementation(async (value: string) => (value.endsWith(file) ? path.join(root, "secret.png") : value));
    await expect(loadTeamLogo(`/team-logos/${file}`, { publicRoot: root, env: DEV, realpathImpl })).resolves.toEqual({ ok: false, code: "logo_unsupported_source" });
  });

  it.skipIf(!canSymlink)("refuses a real symlink that points outside the logo directory", async () => {
    const link = localName("png").replace("team-1", "link");
    await symlink(path.join(root, "secret.png"), path.join(root, "team-logos", link), "file");
    await expect(loadTeamLogo(`/team-logos/${link}`, { publicRoot: root, env: DEV })).resolves.toEqual({ ok: false, code: "logo_unsupported_source" });
  });
});
