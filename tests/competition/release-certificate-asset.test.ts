import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  materializeReleaseCertificateAsset,
  runReleaseFixtureCleanup,
  type ReleaseAssetFileSystem,
} from "../e2e/helpers/fixtures";

const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function assetPath(name = "logo.png") {
  const directory = await mkdtemp(join(tmpdir(), "miracle-release-certificate-"));
  scratch.push(directory);
  const filePath = join(directory, "certificate-assets", name);
  await mkdir(dirname(filePath), { recursive: true });
  return filePath;
}

const realFileSystem: ReleaseAssetFileSystem = {
  open: async (filePath, flags) => open(filePath, flags),
  readFile,
  unlink,
};

describe("release certificate fixture asset ownership", () => {
  it("uses exclusive ownership and never overwrites a same-key owner", async () => {
    const filePath = await assetPath();
    await materializeReleaseCertificateAsset(filePath, Buffer.from("owner"), realFileSystem);

    await expect(materializeReleaseCertificateAsset(filePath, Buffer.from("contender"), realFileSystem))
      .rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(filePath)).resolves.toEqual(Buffer.from("owner"));
  });

  it("derives byte size and SHA-256 from the exact persisted bytes", async () => {
    const filePath = await assetPath();
    const persisted = Buffer.from("persisted-bytes");
    const fileSystem: ReleaseAssetFileSystem = {
      ...realFileSystem,
      open: async (targetPath, flags) => {
        const handle = await open(targetPath, flags);
        return { writeFile: async () => handle.writeFile(persisted), close: () => handle.close() };
      },
    };

    const asset = await materializeReleaseCertificateAsset(filePath, Buffer.from("requested"), fileSystem);

    expect(asset).toMatchObject({
      byteSize: persisted.byteLength,
      contentSha256: createHash("sha256").update(persisted).digest("hex"),
    });
    await asset.cleanup();
  });

  it("owns the opened path early enough to remove a partial write", async () => {
    const filePath = await assetPath();
    const writeError = new Error("fixture write failed");
    const fileSystem: ReleaseAssetFileSystem = {
      ...realFileSystem,
      open: async (targetPath, flags) => {
        const handle = await open(targetPath, flags);
        return { writeFile: async () => { throw writeError; }, close: () => handle.close() };
      },
    };

    await expect(materializeReleaseCertificateAsset(filePath, Buffer.from("fixture"), fileSystem)).rejects.toBe(writeError);
    await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("ignores only ENOENT and retains ownership after other unlink failures", async () => {
    const missingPath = await assetPath("missing.png");
    const missing = await materializeReleaseCertificateAsset(missingPath, Buffer.from("fixture"), realFileSystem);
    await unlink(missingPath);
    await expect(missing.cleanup()).resolves.toBeUndefined();

    const retainedPath = await assetPath("retained.png");
    const unlinkError = Object.assign(new Error("fixture unlink failed"), { code: "EACCES" });
    let fail = true;
    const unlinkMock = vi.fn(async (targetPath: string) => {
      if (fail) throw unlinkError;
      await unlink(targetPath);
    });
    const retained = await materializeReleaseCertificateAsset(retainedPath, Buffer.from("fixture"), {
      ...realFileSystem,
      unlink: unlinkMock,
    });
    await expect(retained.cleanup()).rejects.toBe(unlinkError);
    fail = false;
    await expect(retained.cleanup()).resolves.toBeUndefined();
    await expect(retained.cleanup()).resolves.toBeUndefined();
    expect(unlinkMock).toHaveBeenCalledTimes(2);
  });

  it("reports both setup and exact-cleanup failures", async () => {
    const filePath = await assetPath();
    const writeError = new Error("fixture write failed");
    const cleanupError = Object.assign(new Error("fixture cleanup failed"), { code: "EACCES" });
    const fileSystem: ReleaseAssetFileSystem = {
      ...realFileSystem,
      open: async (targetPath, flags) => {
        const handle = await open(targetPath, flags);
        return { writeFile: async () => { throw writeError; }, close: () => handle.close() };
      },
      unlink: async () => { throw cleanupError; },
    };

    await expect(materializeReleaseCertificateAsset(filePath, Buffer.from("fixture"), fileSystem))
      .rejects.toSatisfy((error) => error instanceof AggregateError
        && error.errors.includes(writeError)
        && error.errors.includes(cleanupError));
    await unlink(filePath);
  });

  it("continues exact asset cleanup after another cleanup step fails", async () => {
    const databaseError = new Error("database cleanup failed");
    const assetCleanup = vi.fn(async () => undefined);

    await expect(runReleaseFixtureCleanup([
      async () => { throw databaseError; },
      assetCleanup,
    ])).rejects.toSatisfy((error) => error instanceof AggregateError && error.errors.includes(databaseError));
    expect(assetCleanup).toHaveBeenCalledOnce();
  });
});
