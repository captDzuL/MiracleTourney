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

function tokenValue(source: string, name: string): string {
  return new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(source)?.[1] ?? "";
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

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

  it("provides AA semantic foregrounds and visible control focus in dark and light themes", () => {
    const darkSource = tokenSource.slice(tokenSource.indexOf(".miracle-v3 {"), tokenSource.indexOf('html[data-panel-theme="dark"]'));
    const lightSource = tokenSource.slice(tokenSource.indexOf('.miracle-v3[data-theme="light"]'), tokenSource.indexOf(".miracle-v3 .miracle-focus-ring"));
    const inherited = (source: string, name: string) => tokenValue(source, name) || tokenValue(darkSource, name);

    for (const source of [darkSource, lightSource]) {
      expect(contrastRatio(inherited(source, "--color-on-accent"), inherited(source, "--color-brand-violet"))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(inherited(source, "--color-accent-cyan-foreground"), inherited(source, "--color-surface"))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(inherited(source, "--color-accent-violet-foreground"), inherited(source, "--color-surface"))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(inherited(source, "--color-accent-cream-foreground"), inherited(source, "--color-surface"))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(inherited(source, "--color-text-muted"), inherited(source, "--color-surface-subtle"))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(inherited(source, "--color-focus-ring"), inherited(source, "--color-surface"))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(inherited(source, "--color-border-strong"), inherited(source, "--color-surface"))).toBeGreaterThanOrEqual(3);
    }
  });

  it("disables motion only within V3 scopes for reduced-motion users", () => {
    const reducedMotion = tokenSource.slice(tokenSource.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(reducedMotion).toContain(".miracle-v3,");
    expect(reducedMotion).toContain(".miracle-v3 *,");
    expect(reducedMotion).toContain(".miracle-v3 *::before,");
    expect(reducedMotion).toContain(".miracle-v3 *::after");
    expect(reducedMotion).toContain("transition: none !important;");
    expect(reducedMotion).toContain("animation: none !important;");
    expect(reducedMotion).toContain("scroll-behavior: auto !important;");
    expect(reducedMotion).not.toMatch(/(^|\n)\s*\*,/);
  });
});
