/**
 * Panel theme — dark mode for the admin / captain / organizer surfaces only.
 *
 * The public pages are deliberately excluded: the poster system behind
 * `public_visual_v2` is dark by design and is not a switchable theme.
 *
 * The resolved value lives on `<html data-panel-theme="...">` so an inline
 * script can set it before the first paint, while the visual effect is scoped
 * to the `.panel-surface` wrapper so public pages stay untouched.
 */

export const PANEL_THEME_STORAGE_KEY = "mt-panel-theme";
export const PANEL_THEME_ATTRIBUTE = "data-panel-theme";

export const PANEL_THEME_MODES = ["light", "dark", "system"] as const;

export type PanelThemeMode = (typeof PANEL_THEME_MODES)[number];
export type ResolvedPanelTheme = "light" | "dark";

export const DEFAULT_PANEL_THEME_MODE: PanelThemeMode = "system";

export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

export function isPanelThemeMode(value: unknown): value is PanelThemeMode {
  return typeof value === "string" && (PANEL_THEME_MODES as readonly string[]).includes(value);
}

export function toPanelThemeMode(value: unknown): PanelThemeMode {
  return isPanelThemeMode(value) ? value : DEFAULT_PANEL_THEME_MODE;
}

export function resolvePanelTheme(mode: PanelThemeMode, prefersDark: boolean): ResolvedPanelTheme {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

/**
 * Runs before React hydrates and before the first paint, so switching pages or
 * reloading never flashes the light palette. Kept as a single expression string
 * because it is injected with `dangerouslySetInnerHTML`.
 *
 * It only ever writes a literal "light" or "dark", never user input.
 */
export const PANEL_THEME_INIT_SCRIPT = [
  "(function(){try{",
  `var k=${JSON.stringify(PANEL_THEME_STORAGE_KEY)};`,
  "var m=window.localStorage.getItem(k);",
  'if(m!=="light"&&m!=="dark"&&m!=="system"){m="system";}',
  `var d=m==="dark"||(m==="system"&&window.matchMedia(${JSON.stringify(PREFERS_DARK_QUERY)}).matches);`,
  `document.documentElement.setAttribute(${JSON.stringify(PANEL_THEME_ATTRIBUTE)},d?"dark":"light");`,
  `}catch(e){document.documentElement.setAttribute(${JSON.stringify(PANEL_THEME_ATTRIBUTE)},"light");}})();`,
].join("");
