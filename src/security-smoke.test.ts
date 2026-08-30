import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("security smoke checks", () => {
  function collectApplicationSourceFiles() {
    return [
      ...fs.readdirSync(path.resolve(process.cwd(), "src/lib"), { recursive: true })
        .map((entry) => path.resolve(process.cwd(), "src/lib", String(entry))),
      ...fs.readdirSync(path.resolve(process.cwd(), "src/app"), { recursive: true })
        .map((entry) => path.resolve(process.cwd(), "src/app", String(entry))),
    ].filter((filePath) => /\.(ts|tsx)$/.test(filePath) && fs.existsSync(filePath));
  }

  it("middleware does not fall back to the public placeholder JWT secret", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/middleware.ts"), "utf8");

    expect(source).not.toContain("process.env.JWT_SECRET ??");
    expect(source).toContain("if (!secret || secret === DEFAULT_JWT_SECRET) return null");
  });

  it("next config keeps baseline browser security headers enabled", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "next.config.ts"), "utf8");

    expect(source).toContain("X-Frame-Options");
    expect(source).toContain("X-Content-Type-Options");
    expect(source).toContain("Referrer-Policy");
    expect(source).toContain("Permissions-Policy");
    expect(source).toContain("Strict-Transport-Security");
    expect(source).toContain("Content-Security-Policy");
  });

  it("production build does not depend on fetching Google Fonts", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(source).not.toContain("next/font/google");
  });

  it("next image optimization does not allow every remote HTTPS host", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "next.config.ts"), "utf8");

    expect(source).not.toContain('hostname: "**"');
  });

  it("raw SQL scan includes application library files", () => {
    const sourceFiles = collectApplicationSourceFiles();

    expect(sourceFiles).toContain(path.resolve(process.cwd(), "src/lib/actions.ts"));
    expect(sourceFiles).toContain(path.resolve(process.cwd(), "src/lib/platform/repository.ts"));
    expect(sourceFiles).toContain(path.resolve(process.cwd(), "src/app/api/admin/captain-credentials/route.ts"));
  });

  it("application code does not use raw SQL escape hatches", () => {
    const sourceFiles = collectApplicationSourceFiles();

    const combinedSource = sourceFiles
      .map((filePath) => fs.readFileSync(filePath, "utf8"))
      .join("\n");

    expect(combinedSource).not.toMatch(/\$queryRaw|\$executeRaw|queryRawUnsafe|executeRawUnsafe/);
  });
});
