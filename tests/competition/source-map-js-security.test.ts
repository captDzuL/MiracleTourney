import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test } from "vitest";

const rootRequire = createRequire(import.meta.url);
const nextRequire = createRequire(rootRequire.resolve("next/package.json"));
const postcssRequire = createRequire(nextRequire.resolve("postcss/package.json"));
const sourceMapRequire = createRequire(postcssRequire.resolve("source-map-js/package.json"));
const { SourceMapConsumer } = sourceMapRequire("source-map-js") as {
  SourceMapConsumer: new (map: object) => { sources: readonly string[] };
};

const ordinaryMap = {
  version: 3,
  sources: ["source.js"],
  names: [],
  mappings: "AAAA",
};

function indexedMap(line: unknown, column: unknown, map: object = ordinaryMap) {
  return { version: 3, sections: [{ offset: { line, column }, map }] };
}

describe("Next's resolved source-map-js dependency", () => {
  test("uses the patched release recorded in the lockfile", () => {
    const version = postcssRequire("source-map-js/package.json").version as string;
    const lock = fs.readFileSync(path.resolve(__dirname, "../../pnpm-lock.yaml"), "utf8");

    expect(version).toBe("1.2.2");
    expect(lock).toMatch(/^  source-map-js@1\.2\.2:$/m);
    expect(lock).toMatch(/^      source-map-js: 1\.2\.2$/m);
    expect(lock).not.toMatch(/^  source-map-js@1\.2\.1:$/m);
  });

  test.each([
    [10_000_001, 0],
    [-1, 0],
    [1.5, 0],
    [Number.MAX_SAFE_INTEGER + 1, 0],
    [0, -1],
    [0, 1.5],
  ])("rejects an invalid indexed-map offset (%s, %s)", (line, column) => {
    expect(() => new SourceMapConsumer(indexedMap(line, column))).toThrow();
  });

  test("rejects nested offsets whose sum exceeds the limit", () => {
    const nested = indexedMap(5_000_001, 0, indexedMap(5_000_000, 0));
    expect(() => new SourceMapConsumer(nested)).toThrow();
  });

  test("accepts an ordinary indexed map", () => {
    expect(new SourceMapConsumer(indexedMap(1, 0)).sources).toEqual(["source.js"]);
  });
});
