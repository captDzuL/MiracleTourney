import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicOngoingEvent } = vi.hoisted(() => ({ getPublicOngoingEvent: vi.fn() }));
vi.mock("@/lib/events/public-ongoing", () => ({ getPublicOngoingEvent }));

import { GET } from "./route";

describe("public ongoing-event API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects traversal and SQL-shaped slugs before querying", async () => {
    const response = await GET(
      new Request("https://app.example/api/events/%27%20OR%201%3D1--/ongoing"),
      { params: Promise.resolve({ slug: "' OR 1=1--" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input" });
    expect(getPublicOngoingEvent).not.toHaveBeenCalled();
  });

  it("maps reader failures to an opaque internal error", async () => {
    getPublicOngoingEvent.mockRejectedValue(new Error("Prisma P2028 secret stack"));

    const response = await GET(
      new Request("https://app.example/api/events/event-safe/ongoing", { headers: { "x-vercel-id": "req-ongoing-1" } }),
      { params: Promise.resolve({ slug: "event-safe" }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "internal_error", requestId: "req-ongoing-1" });
  });
});
