import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Refactor PR 1.4: the session guards and request helpers every server action starts with, tested where they now live.
// The code is identical to what actions.ts had; these tests pin who gets in, where everyone else goes, and how ids are read.

const { requireRole, redirectToActiveLocale, getLocalizedRedirectPath, redirect } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  redirectToActiveLocale: vi.fn(async (path: string) => {
    throw new Error(`ACTIVE_REDIRECT:${path}`);
  }),
  getLocalizedRedirectPath: vi.fn((path: string, locale: string) => `/${locale}${path}`),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/i18n/redirect", () => ({ redirectToActiveLocale, getLocalizedRedirectPath }));
vi.mock("next/navigation", () => ({ redirect }));

import type { AppUser } from "@/lib/platform/types";
import { actionEntityId, redirectToRequestedLocale } from "./request";
import { assertWorkspaceEventAction, requireAdminSession, requireCaptainSession } from "./session";

const user = (role: AppUser["role"], id = `${role}-1`): AppUser => ({ id, role, email: `${id}@test.com`, name: id });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdminSession", () => {
  it("returns a platform admin and asks for no other role", async () => {
    requireRole.mockResolvedValueOnce(user("platform_admin"));

    await expect(requireAdminSession()).resolves.toMatchObject({ role: "platform_admin" });
    expect(requireRole.mock.calls).toEqual([["platform_admin"]]);
  });

  it("falls back to an organizer, then to an admin, in that order", async () => {
    requireRole.mockResolvedValueOnce(null).mockResolvedValueOnce(user("organizer"));
    await expect(requireAdminSession()).resolves.toMatchObject({ role: "organizer" });
    expect(requireRole.mock.calls).toEqual([["platform_admin"], ["organizer"]]);

    requireRole.mockClear();
    requireRole.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(user("admin"));
    await expect(requireAdminSession()).resolves.toMatchObject({ role: "admin" });
    expect(requireRole.mock.calls).toEqual([["platform_admin"], ["organizer"], ["admin"]]);
  });

  it("sends a visitor without any of those roles to the login page", async () => {
    requireRole.mockResolvedValue(null);

    await expect(requireAdminSession()).rejects.toThrow("ACTIVE_REDIRECT:/login");
    expect(requireRole).toHaveBeenCalledTimes(3);
  });
});

describe("requireCaptainSession", () => {
  it("returns a captain, asking only for the captain role", async () => {
    requireRole.mockResolvedValue(user("captain"));

    await expect(requireCaptainSession()).resolves.toMatchObject({ role: "captain" });
    expect(requireRole.mock.calls).toEqual([["captain"]]);
  });

  it("sends everyone else to the login page", async () => {
    requireRole.mockResolvedValue(null);

    await expect(requireCaptainSession()).rejects.toThrow("ACTIVE_REDIRECT:/login");
  });
});

describe("assertWorkspaceEventAction", () => {
  it.each(["platform_admin", "admin"] as const)("lets %s work on any event", (role) => {
    expect(() => assertWorkspaceEventAction(user(role), "event-1")).not.toThrow();
  });

  it("lets an organizer work on an event in their own workspace", () => {
    expect(() => assertWorkspaceEventAction(user("organizer", "org-1"), "event-1")).not.toThrow();
  });

  it.each(["captain", "public"] as const)("denies %s", (role) => {
    expect(() => assertWorkspaceEventAction(user(role as AppUser["role"]), "event-1")).toThrow("Not authorized");
  });
});

describe("redirectToRequestedLocale", () => {
  it.each(["id", "en"])("redirects into the requested locale %s", async (locale) => {
    await expect(redirectToRequestedLocale("/admin?success=ok", locale)).rejects.toThrow(`REDIRECT:/${locale}/admin?success=ok`);

    expect(getLocalizedRedirectPath).toHaveBeenCalledWith("/admin?success=ok", locale);
    expect(redirectToActiveLocale).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "fr", "ID", "../evil"])("uses the active locale when the requested one is %j", async (locale) => {
    await expect(redirectToRequestedLocale("/admin", locale as string | undefined)).rejects.toThrow("ACTIVE_REDIRECT:/admin");

    expect(redirect).not.toHaveBeenCalled();
    expect(getLocalizedRedirectPath).not.toHaveBeenCalled();
  });
});

describe("actionEntityId", () => {
  it.each(["event-1", "cmabc123XYZ", "a_b-c", "e1"])("accepts the id %j", (id) => {
    expect(actionEntityId.parse(id)).toBe(id);
  });

  it.each(["", "../etc/passwd", "a b", "event/1", "id;drop", "<script>"])("rejects the id %j", (id) => {
    expect(() => actionEntityId.parse(id)).toThrow();
  });

  it("rejects a missing or non-text value, as a form field that was not sent", () => {
    expect(() => actionEntityId.parse(null)).toThrow();
    expect(() => actionEntityId.parse(undefined)).toThrow();
  });
});

// Refactor PR 1.5: these modules are shared by many server action files. They must stay plain modules: a file with the
// server action directive turns every export into an endpoint the browser can call. And nothing that uploads images may
// import the big actions.ts again, which is the cycle PR 1.5 removed.
describe("the shared modules stay plain and cycle-free", () => {
  const SHARED_DIR = __dirname;
  const SRC_DIR = path.resolve(__dirname, "../../..");
  const DIRECTIVE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']/;

  it("has no server action directive in any file of actions/shared", () => {
    const files = fs.readdirSync(SHARED_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

    expect(files).toEqual(expect.arrayContaining(["ids.ts", "limits.ts", "request.ts", "session.ts", "uploads.ts"]));
    expect(files.filter((name) => DIRECTIVE.test(fs.readFileSync(path.join(SHARED_DIR, name), "utf8")))).toEqual([]);
  });

  it("is imported from its own path by the files that upload images, not through actions.ts", () => {
    const uploaders = [
      "lib/actions/certificate-v3-actions.ts",
      "lib/actions/event-revision-actions.ts",
      "lib/actions/registration-v3-actions.ts",
      "app/api/organizer/events/[eventId]/bracket-appearance/route.ts",
    ];
    for (const relative of uploaders) {
      const text = fs.readFileSync(path.join(SRC_DIR, relative), "utf8");
      expect(text, relative).toContain('from "@/lib/actions/shared/uploads"');
      expect(text, relative).not.toMatch(/from ["']@\/lib\/actions["']|import\(["']@\/lib\/actions["']\)/);
    }
  });
});
