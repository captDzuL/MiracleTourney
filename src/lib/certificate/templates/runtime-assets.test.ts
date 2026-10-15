import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../../next.config";
import { CHARACTER_LIBRARY } from "../character-library";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
type Matcher = (value: string) => boolean;
// Next.js matches routes against the keys of outputFileTracingIncludes with exactly these picomatch options.
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (glob: string, options: { dot: boolean; contains: boolean }) => Matcher;
const matchesRoute = (key: string, route: string) => picomatch(key, { dot: true, contains: true })(route);
const tracingIncludes = (nextConfig.outputFileTracingIncludes ?? {}) as Record<string, string[]>;
const CERTIFICATES_ROUTE = "/[locale]/organizer/events/[eventId]/certificates";

/** Files the V3 template reads with process.cwd() at runtime; Vercel only ships them when next.config includes them. */
const RUNTIME_ASSETS = [
  "node_modules/@fontsource/montserrat/files/montserrat-latin-800-normal.woff2",
  "public/logo/miracle-horizontal.svg",
] as const;

describe("certificate runtime assets", () => {
  it.each(RUNTIME_ASSETS)("%s exists and is read by the template", (asset) => {
    expect(existsSync(path.join(root, asset))).toBe(true);
    const template = read("src/lib/certificate/templates/miracle-v3.ts");
    const fileName = asset.split("/").at(-1)!;
    expect(template).toContain(fileName);
  });

  it.each(RUNTIME_ASSETS)("%s is listed in outputFileTracingIncludes", (asset) => {
    expect(read("next.config.ts")).toContain(`"./${asset}"`);
  });
});

describe("character library files in the certificates page trace", () => {
  const certificatesKeys = Object.keys(tracingIncludes).filter((key) => matchesRoute(key, CERTIFICATES_ROUTE) && key !== "/**");
  const certificatesIncludes = certificatesKeys.flatMap((key) => tracingIncludes[key]);
  const isIncluded = (file: string) => certificatesIncludes.some((glob) => picomatch(glob.replace(/^\.\//, ""), { dot: true, contains: false })(file));

  it("has a tracing key that matches the certificates page route", () => {
    expect(certificatesKeys.length).toBeGreaterThan(0);
  });

  it.each([
    "/[locale]/organizer/events/[eventId]/overview",
    "/[locale]/organizer/events/[eventId]/completion",
    "/[locale]/certificates/verify/[verificationCode]",
    "/[locale]/admin",
    "/",
  ])("does not trace the character files for the unrelated route %s", (route) => {
    const keys = Object.keys(tracingIncludes).filter((key) => key !== "/**" && matchesRoute(key, route));
    expect(keys).toEqual([]);
  });

  it.each(CHARACTER_LIBRARY.map((character) => [character.id, character.file] as const))("covers the %s file by an include glob", (_id, file) => {
    expect(isIncluded(`public/${file}`)).toBe(true);
  });

  it("does not ship the thumbnails, which are served over HTTP", () => {
    for (const character of CHARACTER_LIBRARY) expect(isIncluded(`public/${character.thumb}`)).toBe(false);
  });

  it("only lists globs for folders that exist", () => {
    for (const glob of certificatesIncludes) expect(existsSync(path.join(root, path.dirname(glob))), glob).toBe(true);
  });
});
