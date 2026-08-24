import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_THEME_MODE,
  PANEL_THEME_ATTRIBUTE,
  PANEL_THEME_INIT_SCRIPT,
  PANEL_THEME_MODES,
  PANEL_THEME_STORAGE_KEY,
  isPanelThemeMode,
  resolvePanelTheme,
  toPanelThemeMode,
} from "./panel-theme";

describe("resolvePanelTheme", () => {
  it("returns the explicit choice regardless of the OS preference", () => {
    expect(resolvePanelTheme("light", false)).toBe("light");
    expect(resolvePanelTheme("light", true)).toBe("light");
    expect(resolvePanelTheme("dark", false)).toBe("dark");
    expect(resolvePanelTheme("dark", true)).toBe("dark");
  });

  it("follows the OS preference in system mode", () => {
    expect(resolvePanelTheme("system", false)).toBe("light");
    expect(resolvePanelTheme("system", true)).toBe("dark");
  });

  it("never resolves to anything other than light or dark", () => {
    for (const mode of PANEL_THEME_MODES) {
      for (const prefersDark of [true, false]) {
        expect(["light", "dark"]).toContain(resolvePanelTheme(mode, prefersDark));
      }
    }
  });
});

describe("isPanelThemeMode", () => {
  it("accepts every supported mode", () => {
    for (const mode of PANEL_THEME_MODES) {
      expect(isPanelThemeMode(mode)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const value of ["", "Dark", "DARK", "1", "true", null, undefined, 0, {}, []]) {
      expect(isPanelThemeMode(value)).toBe(false);
    }
  });
});

describe("toPanelThemeMode", () => {
  it("passes supported modes through", () => {
    expect(toPanelThemeMode("dark")).toBe("dark");
  });

  it("falls back to system for corrupted storage values", () => {
    expect(toPanelThemeMode("nonsense")).toBe(DEFAULT_PANEL_THEME_MODE);
    expect(toPanelThemeMode(null)).toBe("system");
  });
});

describe("PANEL_THEME_INIT_SCRIPT", () => {
  it("references the same storage key and attribute the toggle uses", () => {
    expect(PANEL_THEME_INIT_SCRIPT).toContain(PANEL_THEME_STORAGE_KEY);
    expect(PANEL_THEME_INIT_SCRIPT).toContain(PANEL_THEME_ATTRIBUTE);
  });

  it("cannot break out of the inline script tag", () => {
    expect(PANEL_THEME_INIT_SCRIPT).not.toContain("</script");
  });

  it("sets light when storage throws", () => {
    const documentElement = { attributes: new Map<string, string>() };
    const fakeDocument = {
      documentElement: {
        setAttribute(name: string, value: string) {
          documentElement.attributes.set(name, value);
        },
      },
    };
    const fakeWindow = {
      localStorage: {
        getItem() {
          throw new Error("blocked");
        },
      },
      matchMedia: () => ({ matches: true }),
    };

    new Function("window", "document", PANEL_THEME_INIT_SCRIPT)(fakeWindow, fakeDocument);

    expect(documentElement.attributes.get(PANEL_THEME_ATTRIBUTE)).toBe("light");
  });

  it.each([
    ["dark", false, "dark"],
    ["light", true, "light"],
    ["system", true, "dark"],
    ["system", false, "light"],
    [null, true, "dark"],
    ["corrupted", false, "light"],
  ])("stored=%s prefersDark=%s resolves to %s", (stored, prefersDark, expected) => {
    const written = new Map<string, string>();
    const fakeDocument = {
      documentElement: {
        setAttribute(name: string, value: string) {
          written.set(name, value);
        },
      },
    };
    const fakeWindow = {
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: prefersDark }),
    };

    new Function("window", "document", PANEL_THEME_INIT_SCRIPT)(fakeWindow, fakeDocument);

    expect(written.get(PANEL_THEME_ATTRIBUTE)).toBe(expected);
  });
});
