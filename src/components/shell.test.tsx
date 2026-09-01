import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AppShell footer", () => {
  it("keeps the community tagline without the Vercel and Neon status badge", () => {
    const root = process.cwd();
    const shellSource = readFileSync(join(root, "src", "components", "shell.tsx"), "utf8");
    const enMessages = JSON.parse(readFileSync(join(root, "messages", "en.json"), "utf8"));
    const idMessages = JSON.parse(readFileSync(join(root, "messages", "id.json"), "utf8"));

    expect(shellSource).toContain('t("footer.tagline")');
    expect(shellSource).not.toContain('t("footer.ready")');
    expect(shellSource).not.toContain("ShieldCheck");
    expect(enMessages.nav.footer).toEqual({
      tagline: "Multi-game community tournament platform",
    });
    expect(idMessages.nav.footer).toEqual({
      tagline: "Platform turnamen komunitas multi-game",
    });
  });
});
