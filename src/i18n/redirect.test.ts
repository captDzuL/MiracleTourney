import { afterEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ requestLocale: undefined as string | undefined, cookieLocale: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(boundary.requestLocale ? { "x-next-intl-locale": boundary.requestLocale } : {}),
  cookies: async () => ({ get: () => boundary.cookieLocale ? { value: boundary.cookieLocale } : undefined }),
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

import { getLocalizedRedirectPath, redirectToActiveLocale } from "./redirect";

afterEach(() => { boundary.requestLocale = undefined; boundary.cookieLocale = undefined; });

describe("redirectToActiveLocale request context", () => {
  it.each([undefined, "id"])("keeps the current English route when locale cookie is %s", async cookieLocale => {
    boundary.requestLocale = "en"; boundary.cookieLocale = cookieLocale;
    await expect(redirectToActiveLocale("/organizer/events/owned/legacy-match-day?matchId=match&success=match-result-updated")).rejects.toThrow("REDIRECT:/en/organizer/events/owned/legacy-match-day?matchId=match&success=match-result-updated");
  });
  it("rejects an unsupported request locale and uses the valid cookie", async () => {
    boundary.requestLocale = "//foreign.example"; boundary.cookieLocale = "en";
    await expect(redirectToActiveLocale("/organizer/events/owned/legacy-match-day?error=invalid")).rejects.toThrow("REDIRECT:/en/organizer/events/owned/legacy-match-day?error=invalid");
  });
  it("uses the default locale when neither source is valid", async () => {
    boundary.requestLocale = "fr"; boundary.cookieLocale = "//foreign.example";
    await expect(redirectToActiveLocale("/organizer")).rejects.toThrow("REDIRECT:/id/organizer");
  });
});

describe("getLocalizedRedirectPath", () => {
  it("adds the requested locale to an unprefixed application path", () => {
    expect(getLocalizedRedirectPath("/events/mfl-season-3/register", "id")).toBe(
      "/id/events/mfl-season-3/register",
    );
  });

  it("replaces an existing locale instead of prefixing it twice", () => {
    expect(getLocalizedRedirectPath("/en/events/mfl-season-3/register", "id")).toBe(
      "/id/events/mfl-season-3/register",
    );
    expect(getLocalizedRedirectPath("/id/events/mfl-season-3/register", "en")).toBe(
      "/en/events/mfl-season-3/register",
    );
  });

  it("preserves query parameters while normalizing the locale", () => {
    expect(getLocalizedRedirectPath("/id/captain?tab=registration&eventId=event-1", "id")).toBe(
      "/id/captain?tab=registration&eventId=event-1",
    );
  });
});
