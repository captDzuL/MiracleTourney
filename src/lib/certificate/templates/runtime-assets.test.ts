import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

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
