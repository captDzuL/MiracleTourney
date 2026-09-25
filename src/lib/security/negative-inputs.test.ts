import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isSafeEntityId,
  isSafeFilename,
  isSafeHttpUrl,
  requireSameOrigin,
  neutralizeSpreadsheetFormula,
} from "@/lib/security/request-guard";
import { toPublicError } from "@/lib/security/public-error";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { validateTeamData } from "@/lib/validation/team-data";

describe("security negative-input matrix", () => {
  it("rejects SQL-shaped unsafe identifiers before a data access boundary", () => {
    const request = new Request("https://app.example/api/admin/captain-credentials?eventId=%27%20OR%201%3D1--", {
      headers: { origin: "https://evil.example" },
      method: "POST",
    });

    const response = requireSameOrigin(request);

    expect(response?.status).toBe(403);
    expect(response?.headers.get("content-type")).toContain("application/json");
  });

  it("allows same-origin reads and does not require an origin on safe methods", () => {
    expect(requireSameOrigin(new Request("https://app.example/api/events/demo"))).toBeNull();
    expect(requireSameOrigin(new Request("https://app.example/api/events/demo", {
      method: "GET",
      headers: { origin: "https://evil.example" },
    }))).toBeNull();
    expect(requireSameOrigin(new Request("https://app.example/api/events/demo", {
      method: "POST",
      headers: { origin: "https://app.example" },
    }))).toBeNull();
  });

  it("rejects an unsafe request with no Origin header", () => {
    const response = requireSameOrigin(new Request("https://app.example/api/admin/captain-credentials", {
      method: "POST",
    }));

    expect(response?.status).toBe(403);
    expect(response?.json()).resolves.toMatchObject({ code: "forbidden" });
  });

  it("rejects a same-site sibling origin for unsafe requests", () => {
    const response = requireSameOrigin(new Request("https://app.example/api/admin/captain-credentials", {
      method: "POST",
      headers: { origin: "https://tenant.example" },
    }));

    expect(response?.status).toBe(403);
  });

  it("maps malformed, authorization, and internal errors to a safe public body", () => {
    expect(toPublicError({ name: "ZodError", issues: [{ path: ["eventId"] }] }, "req-invalid")).toEqual({
      status: 400,
      body: { code: "invalid_input", requestId: "req-invalid" },
    });
    expect(toPublicError(new Error("Not authorized for event"), "req-forbidden")).toEqual({
      status: 403,
      body: { code: "forbidden", requestId: "req-forbidden" },
    });

    const result = toPublicError(new Error("Prisma P2028 at db://secret; stack: hidden"), "req-internal");
    expect(result).toEqual({ status: 500, body: { code: "internal_error", requestId: "req-internal" } });
    expect(JSON.stringify(result)).not.toMatch(/Prisma|P2028|secret|stack/i);
  });

  it("neutralizes formula-leading cells without changing ordinary text", () => {
    expect(neutralizeSpreadsheetFormula("=HYPERLINK(\"https://evil.example\")")).toBe("'=HYPERLINK(\"https://evil.example\")");
    expect(neutralizeSpreadsheetFormula("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(neutralizeSpreadsheetFormula("-10+20")).toBe("'-10+20");
    expect(neutralizeSpreadsheetFormula("@attacker")).toBe("'@attacker");
    expect(neutralizeSpreadsheetFormula("ordinary text")).toBe("ordinary text");
  });

  it("rejects scriptable URLs, traversal filenames, and malformed IDs", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("https://example.test/registration")).toBe(true);
    expect(isSafeHttpUrl("https://user:password@example.test/registration")).toBe(false);
    expect(isSafeFilename("../secrets.csv")).toBe(false);
    expect(isSafeFilename("C:\\temp\\secrets.csv")).toBe(false);
    expect(isSafeFilename("registration.csv")).toBe(true);
    expect(isSafeEntityId("event-safe_123")).toBe(true);
    expect(isSafeEntityId("event-safe' OR 1=1--")).toBe(false);
  });

  it("rejects stored or reflected markup in user-facing team fields", () => {
    expect(validateTeamData({
      teamName: "<script>alert(1)</script>",
      teamTag: "SAFE",
      captainName: "Captain One",
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "team_name" }),
    ]));
  });

  it("escapes JSON-LD script breakouts while preserving structured data", () => {
    const serialized = serializeJsonLd({ description: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual({ description: "</script><script>alert(1)</script>" });
  });

  it("keeps development locale diagnostics free of cookie headers", () => {
    const source = ["src/middleware.ts", "src/app/api/debug-locale/route.ts"]
      .map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/allCookies|cookieHeader/);
  });

  it("keeps the six API surfaces free of permissive authenticated CORS", () => {
    const routes = [
      "src/app/api/admin/captain-credentials/route.ts",
      "src/app/api/debug-locale/route.ts",
      "src/app/api/events/[slug]/ongoing/route.ts",
      "src/app/api/health/env/route.ts",
      "src/app/api/me/route.ts",
      "src/app/api/organizer/events/[eventId]/competition/route.ts",
    ];

    const source = routes
      .map((route) => fs.readFileSync(path.resolve(process.cwd(), route), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/Access-Control-Allow-Origin\s*["'`]\s*:\s*["'`]\*["'`]/i);
  });

  it("does not permit raw Prisma SQL escape hatches in application code", () => {
    const roots = [path.resolve(process.cwd(), "src/lib"), path.resolve(process.cwd(), "src/app")];
    const sourceFiles = roots.flatMap((root) =>
      fs.readdirSync(root, { recursive: true })
        .map((entry) => path.resolve(root, String(entry)))
        .filter((filePath) => /\.(ts|tsx)$/.test(filePath) && fs.existsSync(filePath)),
    );

    const source = sourceFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
    expect(source).not.toMatch(/\$(?:queryRaw|executeRaw)(?:Unsafe)?/);
  });
});
