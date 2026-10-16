import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

const sharpSpy = vi.hoisted(() => ({ calls: [] as unknown[][], stats: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("sharp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sharp")>();
  const wrapped = ((input: Buffer, options?: object) => {
    sharpSpy.calls.push([input, options]);
    const instance = actual.default(input, options);
    const stats = instance.stats.bind(instance);
    instance.stats = ((...args: []) => { sharpSpy.stats(); return stats(...args); }) as typeof instance.stats;
    return instance;
  }) as unknown as typeof actual.default;
  return { ...actual, default: wrapped };
});

import { ImageUploadValidationError, readImageDimensions, uploadImageAssetImpl } from "./uploads";

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#336699" } }).png({ compressionLevel: 9 }).toBuffer();

const resetSpies = () => { sharpSpy.calls.length = 0; sharpSpy.stats.mockClear(); };

const asFile = (bytes: Buffer) => new File([new Uint8Array(bytes)], "logo.png", { type: "image/png" });

describe("readImageDimensions", () => {

  it("keeps the old behaviour when no maximum is given", async () => {
    const bytes = await png(64, 48);
    resetSpies();
    await expect(readImageDimensions(bytes, true)).resolves.toEqual({ width: 64, height: 48 });
    expect(sharpSpy.stats).toHaveBeenCalledTimes(1);
    expect(sharpSpy.calls[0][1]).toBeUndefined();
    expect(sharpSpy.calls[1][1]).toEqual({ failOn: "error" });
  });

  it("limits the pixels the decode may read when a maximum is given", async () => {
    const bytes = await png(64, 48);
    resetSpies();
    await expect(readImageDimensions(bytes, true, 128)).resolves.toEqual({ width: 64, height: 48 });
    expect(sharpSpy.calls[0][1]).toBeUndefined();
    expect(sharpSpy.calls[1][1]).toEqual({ failOn: "error", limitInputPixels: 128 * 128 });
    expect(sharpSpy.stats).toHaveBeenCalledTimes(1);
  });

  it("reports an oversized image from its header without decoding any pixel", async () => {
    const bytes = await png(5000, 3000);
    resetSpies();
    expect(bytes.length).toBeLessThan(100_000);
    await expect(readImageDimensions(bytes, true, 4096)).resolves.toEqual({ width: 5000, height: 3000 });
    expect(sharpSpy.stats).not.toHaveBeenCalled();
    expect(sharpSpy.calls).toHaveLength(1);
  });

  it("still returns null for bytes that are not an image", async () => {
    await expect(readImageDimensions(Buffer.from("not an image"), true, 4096)).resolves.toBeNull();
  });
});

describe("uploadImageAssetImpl dimension limits", () => {
  const base = { folder: "team-logos", entityId: "team-1", label: "Team logo", maxBytes: 2 * 1024 * 1024, validationMode: "throw", validatePixels: true } as const;

  it("rejects an oversized image as invalid_dimensions, not decode_failed, before decoding pixels", async () => {
    const bytes = await png(6000, 6000);
    resetSpies();
    const failure = await uploadImageAssetImpl({ ...base, file: asFile(bytes), maxDimension: 4096 }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ImageUploadValidationError);
    expect((failure as ImageUploadValidationError).code).toBe("invalid_dimensions");
    expect(sharpSpy.stats).not.toHaveBeenCalled();
  });

  it("rejects an image below the minimum as invalid_dimensions", async () => {
    const failure = await uploadImageAssetImpl({ ...base, file: asFile(await png(16, 16)), minDimension: 32, maxDimension: 4096 }).catch((error: unknown) => error);
    expect((failure as ImageUploadValidationError).code).toBe("invalid_dimensions");
  });
});
