import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/go-live.yml", import.meta.url), "utf8");

describe("go-live workflow guards", () => {
  it("can only be started by hand", () => {
    const triggers = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\npermissions:"));
    expect(triggers).toContain("workflow_dispatch:");
    expect(triggers).not.toMatch(/\b(push|pull_request|pull_request_target|schedule|workflow_run|release):/);
  });

  it("defaults to the read-only dry run and runs inside the protected environment", () => {
    expect(workflow).toMatch(/mode:[\s\S]*?default: dry-run/);
    expect(workflow).toMatch(/^    environment: production-go-live$/m);
    expect(workflow).toMatch(/^permissions:\r?\n  contents: read$/m);
    expect(workflow).toMatch(/cancel-in-progress: false/);
  });

  it("deploys exactly the commit that was dispatched, never an input", () => {
    expect(workflow).toContain("GOLIVE_SHA: ${{ github.sha }}");
    expect(workflow).not.toMatch(/inputs\.(sha|ref|commit|branch)/);
  });

  it("passes inputs and secrets through env only, never interpolated into a shell command", () => {
    for (const line of workflow.split("\n")) {
      if (/^\s+run:/.test(line)) expect(line, line).not.toContain("${{");
    }
    const runBlocks = [...workflow.matchAll(/run: \|\r?\n((?:\s{10,}.*\r?\n?)+)/g)].map((match) => match[1]);
    for (const block of runBlocks) expect(block).not.toContain("${{");
    const secretLines = workflow.split("\n").filter((line) => line.includes("secrets."));
    expect(secretLines.map((line) => line.trim().split(":")[0])).toEqual(["PROD_DIRECT_URL", "NEON_API_KEY", "VERCEL_TOKEN", "NEON_PROD_HOST"]);
  });

  it("builds the reference only from a throwaway local database", () => {
    const urls = [...workflow.matchAll(/^\s+(?:DATABASE_URL|DIRECT_URL|CATALOG_DATABASE_URL): (\S+)/gm)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/@localhost:5432\//);
  });
});
