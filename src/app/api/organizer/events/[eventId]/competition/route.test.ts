import { beforeEach, describe, expect, it, vi } from "vitest";

const { readCompetitionWorkspace } = vi.hoisted(() => ({ readCompetitionWorkspace: vi.fn() }));
vi.mock("@/lib/competition/workspace-read", () => ({ readCompetitionWorkspace }));

import { GET } from "./route";

describe("competition workspace API boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unsafe path identifiers with a stable request-bound error", async () => {
    const response = await GET(new Request("https://app.example/api/organizer/events/../competition"), {
      params: Promise.resolve({ eventId: "../secrets" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input", requestId: expect.any(String) });
    expect(readCompetitionWorkspace).not.toHaveBeenCalled();
  });

  it("redacts repository failures and includes a request id", async () => {
    readCompetitionWorkspace.mockRejectedValue(new Error("Prisma secret stack"));

    const response = await GET(new Request("https://app.example/api/organizer/events/event-safe/competition", {
      headers: { "x-vercel-id": "req-competition-1" },
    }), { params: Promise.resolve({ eventId: "event-safe" }) });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "internal_error", requestId: "req-competition-1" });
  });

  it("does not expose a not-found code for reader availability failures", async () => {
    readCompetitionWorkspace.mockRejectedValue(new Error("competition workspace unavailable"));

    const response = await GET(new Request("https://app.example/api/organizer/events/event-safe/competition", {
      headers: { "x-vercel-id": "req-competition-unavailable" },
    }), { params: Promise.resolve({ eventId: "event-safe" }) });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "internal_error", requestId: "req-competition-unavailable" });
  });
});
