import { createRequire } from "node:module";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const rootRequire = createRequire(new URL("../../package.json", import.meta.url));
const nextRequire = createRequire(rootRequire.resolve("next/package.json"));

describe("installed Sharp security and image compatibility", () => {
  it("loads the patched native Sharp binary from the app and Next consumers", () => {
    for (const requireFrom of [rootRequire, nextRequire]) {
      const installedSharp = requireFrom("sharp") as typeof sharp;
      expect(installedSharp.versions.sharp).toBe("0.35.5");
    }
  });

  it("converts a bounded SVG to PNG and reads PNG metadata with the installed binary", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="#123456"/></svg>');
    const png = await sharp(svg, { limitInputPixels: 48 }).png().toBuffer();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 8, height: 6 });
  });
});
