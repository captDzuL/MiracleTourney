import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tokenPath = join(root, "src", "styles", "miracle-v3-tokens.css");
const tokenSource = existsSync(tokenPath) ? readFileSync(tokenPath, "utf8") : "";
const globalSource = readFileSync(join(root, "src", "app", "globals.css"), "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};

describe("Miracle V3 design tokens", () => {
  it("loads the approved Montserrat UI weights", () => {
    expect(packageJson.dependencies["@fontsource/montserrat"]).toBeDefined();
    expect(globalSource).toContain('@import "@fontsource/montserrat/400.css";');
    expect(globalSource).toContain('@import "@fontsource/montserrat/500.css";');
    expect(globalSource).toContain('@import "@fontsource/montserrat/600.css";');
    expect(globalSource).toContain('@import "@fontsource/montserrat/700.css";');
    expect(globalSource).toContain('@import "@fontsource/montserrat/800.css";');
    expect(tokenSource).toContain('--font-miracle-v3: "Montserrat", sans-serif;');
  });

  it("keeps the approved V3 chromatic brand colors", () => {
    expect(tokenSource).toContain("--color-brand-cyan: #49D1EC;");
    expect(tokenSource).toContain("--color-brand-violet: #AA8BFF;");
    expect(tokenSource).toContain("--color-brand-cream: #F6DFB1;");
  });
});
