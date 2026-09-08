import { beforeEach, describe, expect, it, vi } from "vitest";

const { listTeamsForEvent } = vi.hoisted(() => ({ listTeamsForEvent: vi.fn() }));

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./repository", () => ({ listTeamsForEvent }));

import { getTeamsForEvent } from "./queries";

describe("teams queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the repository read for a given event", async () => {
    listTeamsForEvent.mockResolvedValue([{ id: "team-1" }]);

    await expect(getTeamsForEvent("event-1")).resolves.toEqual([{ id: "team-1" }]);
    expect(listTeamsForEvent).toHaveBeenCalledWith("event-1");
  });
});
