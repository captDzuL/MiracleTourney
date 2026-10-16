import { beforeEach, describe, expect, it, vi } from "vitest";

// Characterization tests for captainSaveDraftTeamAction (lib/actions/registration-actions.ts).
// They pin what the action does today, including its quirks; they are not a specification.

const {
  createOrUpdateCaptainDraftTeam,
  headers,
  requireRole,
  revalidatePath,
  revalidateTag,
  writeServerLog,
} = vi.hoisted(() => ({
  createOrUpdateCaptainDraftTeam: vi.fn(),
  headers: vi.fn(),
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  writeServerLog: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag, unstable_cache: <T>(fn: T) => fn }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
// No request scope: redirectToActiveLocale falls back to redirecting to the path as written (no locale prefix).
vi.mock("next/headers", () => ({ headers, cookies: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/lib/observability/logger", () => ({ writeServerLog }));
vi.mock("@/lib/platform/db", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/platform/settings-repository", () => ({ updatePaymentSettings: vi.fn() }));
vi.mock("@/lib/actions/registration-v3-actions", () => ({}));
vi.mock("@/lib/registration/review-repository", () => ({
  approveTeamRegistrationRequest: vi.fn(),
  rejectTeamRegistrationRequest: vi.fn(),
}));
vi.mock("@/lib/registration/repository", () => ({
  createOrUpdateCaptainDraftTeam,
  createTeamRegistrationRequest: vi.fn(),
  registerTeam: vi.fn(),
  updateTeamRegistrationProof: vi.fn(),
}));

import { captainSaveDraftTeamAction } from "@/lib/actions/registration-actions";
import { UserFacingError } from "@/lib/security/public-error";

type TestUser = { id: string; role: "captain" | "organizer" | "platform_admin" | "admin"; email: string; name: string };

function fd(pairs: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(pairs)) form.set(key, value);
  return form;
}

function captainSession(overrides: Partial<TestUser> = {}): TestUser {
  return { id: "captain-1", role: "captain", email: "cap@test.com", name: "Captain Budi", ...overrides };
}

/** Mirrors the real requireRole: the session user is returned only when its role matches the asked role. */
function signInAs(user: TestUser | null) {
  requireRole.mockImplementation(async (role: string) => (user && user.role === role ? user : null));
}

const ROSTER_PATH = "/captain?tab=roster";

function rosterError(message: string) {
  return `${ROSTER_PATH}&error=${encodeURIComponent(message)}`;
}

async function expectRedirect(action: Promise<unknown>, url: string) {
  await expect(action).rejects.toThrow(new Error(`REDIRECT:${url}`));
}

describe("captainSaveDraftTeamAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    headers.mockRejectedValue(new Error("outside of a request scope"));
    signInAs(captainSession());
    createOrUpdateCaptainDraftTeam.mockResolvedValue(undefined);
  });

  describe("session", () => {
    it("redirects to /login when nobody is signed in", async () => {
      signInAs(null);

      await expectRedirect(captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })), "/login");

      expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it.each(["organizer", "platform_admin", "admin"] as const)(
      "redirects to /login when the signed-in user is a %s, not a captain",
      async (role) => {
        signInAs(captainSession({ id: "other-1", role }));

        await expectRedirect(captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })), "/login");

        expect(requireRole).toHaveBeenCalledWith("captain");
        expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
      },
    );

    it("checks the session before it reads or validates the form", async () => {
      signInAs(null);

      await expectRedirect(captainSaveDraftTeamAction(fd({ name: "", tag: "" })), "/login");
    });
  });

  describe("form validation", () => {
    it("rejects a name shorter than 2 characters", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "A", tag: "GRD" })),
        rosterError("Nama tim minimal 2 karakter."),
      );

      expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("rejects a name that is only whitespace, because it is trimmed before the length check", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "     ", tag: "GRD" })),
        rosterError("Nama tim minimal 2 karakter."),
      );
    });

    it("rejects a name that is 2 characters only because of padding spaces", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: " A ", tag: "GRD" })),
        rosterError("Nama tim minimal 2 karakter."),
      );
    });

    it("rejects a tag shorter than 2 characters", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "G" })),
        rosterError("Tag tim harus 2-5 karakter."),
      );
      expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
    });

    it("rejects a tag longer than 5 characters", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GARUDA" })),
        rosterError("Tag tim harus 2-5 karakter."),
      );
      expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
    });

    it("measures the tag length after trimming", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "  G  " })),
        rosterError("Tag tim harus 2-5 karakter."),
      );
    });

    it("reports only the first problem when both name and tag are invalid, name first", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "A", tag: "TOOLONG" })),
        rosterError("Nama tim minimal 2 karakter."),
      );
    });

    it("shows the readable name message when the name field is missing from the form", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ tag: "GRD" })),
        rosterError("Nama tim minimal 2 karakter."),
      );
      expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
    });

    it("shows the readable tag message when the tag field is missing from the form", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda" })),
        rosterError("Tag tim harus 2-5 karakter."),
      );
    });

    it("treats a name sent as a file as an empty name", async () => {
      const form = fd({ tag: "GRD" });
      form.set("name", new File(["x"], "name.txt"));

      await expectRedirect(
        captainSaveDraftTeamAction(form),
        rosterError("Nama tim minimal 2 karakter."),
      );
    });
  });

  describe("team data rules (validateTeamData)", () => {
    it("rejects a team name with markup", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "<b>Garuda", tag: "GRD" })),
        rosterError("Nama tim mengandung markup yang tidak diizinkan"),
      );
      expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
    });

    it("rejects a team name longer than 64 characters", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "A".repeat(65), tag: "GRD" })),
        rosterError("Nama tim harus antara 2-64 karakter"),
      );
    });

    it("accepts a team name of exactly 64 characters", async () => {
      const name = "A".repeat(64);

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name, tag: "GRD" })),
        `${ROSTER_PATH}&success=draft-team-saved`,
      );

      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledWith(expect.objectContaining({ name }));
    });

    it("rejects a team name with a blocked word", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Tim Sialan", tag: "GRD" })),
        rosterError("Nama tim mengandung kata yang tidak diizinkan"),
      );
    });

    it("rejects a tag with characters other than letters and digits", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "G-R" })),
        rosterError("Tag tim harus 2-5 karakter kapital atau angka"),
      );
      expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
    });

    it("rejects a tag that has a space inside", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "G R" })),
        rosterError("Tag tim harus 2-5 karakter kapital atau angka"),
      );
    });

    it("rejects a tag with a blocked word", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "memek" })),
        rosterError("Tag tim mengandung kata yang tidak diizinkan"),
      );
    });

    it("rejects when the captain's own account name has markup", async () => {
      signInAs(captainSession({ name: "<script>" }));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Nama kapten mengandung markup yang tidak diizinkan"),
      );
      expect(createOrUpdateCaptainDraftTeam).not.toHaveBeenCalled();
    });

    it("rejects when the captain's own account name is shorter than 2 characters", async () => {
      signInAs(captainSession({ name: "B" }));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Nama kapten harus antara 2-64 karakter"),
      );
    });

    it("joins every team data problem into one message with a full stop and a space", async () => {
      signInAs(captainSession({ name: "<i>" }));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "<b>Garuda", tag: "G-R" })),
        rosterError(
          "Nama tim mengandung markup yang tidak diizinkan. Tag tim harus 2-5 karakter kapital atau angka. Nama kapten mengandung markup yang tidak diizinkan",
        ),
      );
    });
  });

  describe("success", () => {
    it("saves the draft with the session captain and redirects to the roster tab with a success flag", async () => {
      signInAs(captainSession({ id: "captain-7", name: "Captain Budi" }));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        "/captain?tab=roster&success=draft-team-saved",
      );

      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledTimes(1);
      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledWith({
        name: "Garuda",
        tag: "GRD",
        captainId: "captain-7",
        captainName: "Captain Budi",
      });
    });

    it("revalidates the teams tag and the /captain path exactly once each", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        `${ROSTER_PATH}&success=draft-team-saved`,
      );

      expect(revalidateTag).toHaveBeenCalledTimes(1);
      expect(revalidateTag).toHaveBeenCalledWith("teams");
      expect(revalidatePath).toHaveBeenCalledTimes(1);
      expect(revalidatePath).toHaveBeenCalledWith("/captain");
    });

    it("saves the draft before it revalidates", async () => {
      createOrUpdateCaptainDraftTeam.mockImplementation(async () => {
        expect(revalidateTag).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
      });

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        `${ROSTER_PATH}&success=draft-team-saved`,
      );

      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledTimes(1);
      expect(revalidateTag).toHaveBeenCalledTimes(1);
    });

    it("trims the name and the tag and upper-cases the tag before saving", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "  Garuda Muda  ", tag: " grd " })),
        `${ROSTER_PATH}&success=draft-team-saved`,
      );

      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledWith({
        name: "Garuda Muda",
        tag: "GRD",
        captainId: "captain-1",
        captainName: "Captain Budi",
      });
    });

    it("accepts the shortest valid name and tag (2 characters each)", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "AB", tag: "ab" })),
        `${ROSTER_PATH}&success=draft-team-saved`,
      );

      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledWith(expect.objectContaining({ name: "AB", tag: "AB" }));
    });

    it("accepts a tag of exactly 5 characters with digits", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "g1r2d" })),
        `${ROSTER_PATH}&success=draft-team-saved`,
      );

      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledWith(expect.objectContaining({ tag: "G1R2D" }));
    });

    it("keeps unicode and emoji in the team name as typed", async () => {
      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Tim Elang ⚡", tag: "ELG" })),
        `${ROSTER_PATH}&success=draft-team-saved`,
      );

      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledWith(expect.objectContaining({ name: "Tim Elang ⚡" }));
    });

    it("ignores a captainId or captainName sent in the form and uses the session instead", async () => {
      signInAs(captainSession({ id: "captain-real", name: "Captain Asli" }));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD", captainId: "attacker-1", captainName: "Palsu" })),
        `${ROSTER_PATH}&success=draft-team-saved`,
      );

      expect(createOrUpdateCaptainDraftTeam).toHaveBeenCalledWith({
        name: "Garuda",
        tag: "GRD",
        captainId: "captain-real",
        captainName: "Captain Asli",
      });
    });
  });

  describe("repository errors", () => {
    it("shows a UserFacingError message to the captain as written", async () => {
      createOrUpdateCaptainDraftTeam.mockRejectedValue(new UserFacingError("Nama tim sudah dipakai di event ini."));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Nama tim sudah dipakai di event ini."),
      );
    });

    it("shows an allowlisted plain error message as written", async () => {
      createOrUpdateCaptainDraftTeam.mockRejectedValue(new Error("Not authorized"));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Not authorized"),
      );
    });

    it("masks an unexpected error with a generic message so internal details do not leak", async () => {
      createOrUpdateCaptainDraftTeam.mockRejectedValue(
        new Error("Invalid `prisma.team.upsert()` invocation: Unique constraint failed on the fields: (`tag`)"),
      );

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Gagal menyimpan draft tim."),
      );
    });

    it("masks a rejection that is not an Error object", async () => {
      createOrUpdateCaptainDraftTeam.mockRejectedValue("boom");

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Gagal menyimpan draft tim."),
      );
    });

    it("percent-encodes the error message in the redirect query string", async () => {
      createOrUpdateCaptainDraftTeam.mockRejectedValue(new UserFacingError("Tim penuh & tidak bisa disimpan? Coba lagi."));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        "/captain?tab=roster&error=Tim%20penuh%20%26%20tidak%20bisa%20disimpan%3F%20Coba%20lagi.",
      );
    });

    it("does not revalidate anything when saving fails", async () => {
      createOrUpdateCaptainDraftTeam.mockRejectedValue(new Error("db down"));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Gagal menyimpan draft tim."),
      );

      expect(revalidateTag).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("writes a server log for an unexpected error, with no team data in it", async () => {
      createOrUpdateCaptainDraftTeam.mockRejectedValue(new Error("db down"));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Gagal menyimpan draft tim."),
      );

      expect(writeServerLog).toHaveBeenCalledTimes(1);
      const entry = writeServerLog.mock.calls[0]?.[0];
      expect(entry).toMatchObject({ phase: "failed", operation: "captain_save_draft_team", route: "/captain", status: 500, errorCode: "Error", resourceId: "captain-1" });
      expect(JSON.stringify(entry)).not.toContain("Garuda");
      expect(JSON.stringify(entry)).not.toContain("db down");
    });

    it("writes no server log for a message the captain is meant to read", async () => {
      createOrUpdateCaptainDraftTeam.mockRejectedValue(new UserFacingError("Nama tim sudah dipakai di event ini."));

      await expectRedirect(
        captainSaveDraftTeamAction(fd({ name: "Garuda", tag: "GRD" })),
        rosterError("Nama tim sudah dipakai di event ini."),
      );

      expect(writeServerLog).not.toHaveBeenCalled();
    });
  });
});
