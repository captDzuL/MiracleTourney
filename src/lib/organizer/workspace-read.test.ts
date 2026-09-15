import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/platform/db", () => ({ prisma: { event: { findFirst } } }));
import { readOrganizerWorkspaceSummary } from "./workspace-read";

const row = {
  id: "cup", name: "Miracle Cup", gameId: "mlbb", format: "Single Elimination", status: "Ongoing",
  publishedAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-14T10:00:00Z"),
  publishedScheduleVersion: null, completion: null,
  _count: { teams: 16, teamRegistrationRequests: 3, matches: 2, statSubmissions: 4, competitionActionItems: 1 },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_FLAG_COMPETITION_OPERATIONS_V3", "true");
  vi.stubEnv("FEATURE_FLAG_COMPLETION_WORKSPACE_V3", "true");
  findFirst.mockImplementation(async ({ where }) => where.id === "cup" && (!where.organizerUserId || where.organizerUserId === "owner") ? row : null);
});
afterEach(() => vi.unstubAllEnvs());

describe("readOrganizerWorkspaceSummary", () => {
  it("exposes the completed participant destination when registration is enabled", async () => {
    vi.stubEnv("FEATURE_FLAG_REGISTRATION_WORKSPACE_V3", "true");
    const view = await readOrganizerWorkspaceSummary("cup", { id: "owner", role: "organizer" });
    expect(view?.capabilities.participants).toBe(true);
  });
  it.each(["organizer", "admin", "platform_admin"] as const)("returns the same compact event facts for an authorized %s", async role => {
    const view = await readOrganizerWorkspaceSummary("cup", { id: role === "organizer" ? "owner" : "staff", role });
    expect(view).toMatchObject({ event: { id: "cup", title: "Miracle Cup" }, role, lifecycle: "ongoing", publication: "published", updatedAt: "2026-09-14T10:00:00.000Z" });
    expect(Object.keys(view!).sort()).toEqual(["badges", "blockers", "capabilities", "event", "lifecycle", "publication", "role", "updatedAt"]);
  });
  it("denies a non-owner without leaking aggregate data", async () => {
    expect(await readOrganizerWorkspaceSummary("cup", { id: "stranger", role: "organizer" })).toBeNull();
  });
  it("returns null for a missing event and a non-manager", async () => {
    expect(await readOrganizerWorkspaceSummary("missing", { id: "staff", role: "admin" })).toBeNull();
    expect(await readOrganizerWorkspaceSummary("cup", { id: "owner", role: "captain" })).toBeNull();
  });
  it("counts queues and emits bounded translated blocker keys without loading route data", async () => {
    const view = await readOrganizerWorkspaceSummary("cup", { id: "owner", role: "organizer" });
    expect(view?.badges).toEqual({ participants: 16, registration: 3, "match-control": 1, completion: 6 });
    expect(view?.blockers.map(b => b.code)).toEqual(["registration_review", "match_results", "statistics_review", "schedule_unpublished"]);
    const query = findFirst.mock.calls[0][0];
    expect(query.select.matches).toBeUndefined();
    expect(query.select.players).toBeUndefined();
    expect(query.select.certificates).toBeUndefined();
    expect(query.select._count.select.teamRegistrationRequests.where.status).toBe("pending_review");
    expect(query.select._count.select.statSubmissions.where.status).toBe("pending");
  });
  it.each([["Draft", "draft", "private"], ["Published", "registration", "published"], ["Registration Closed", "drawing", "published"], ["Finished", "finished", "completed"]])("maps %s lifecycle without treating it as a phase name", async (status, lifecycle, publication) => {
    findFirst.mockResolvedValue({ ...row, status, publishedAt: status === "Draft" ? null : row.publishedAt, completion: status === "Finished" ? { status: "completed" } : null });
    expect(await readOrganizerWorkspaceSummary("cup", { id: "owner", role: "organizer" })).toMatchObject({ lifecycle, publication });
  });
  it("hides unavailable operations and routes owned by later tasks", async () => {
    vi.stubEnv("FEATURE_FLAG_COMPETITION_OPERATIONS_V3", "false");
    vi.stubEnv("FEATURE_FLAG_COMPLETION_WORKSPACE_V3", "false");
    const view = await readOrganizerWorkspaceSummary("cup", { id: "owner", role: "organizer" });
    expect(view?.capabilities).toEqual({ overview: true, registration: true, participants: false, competition: false, schedule: false, "match-control": false, completion: false, announcements: false, settings: false });
    expect(view?.blockers.every(b => view.capabilities[b.section])).toBe(true);
  });
});
