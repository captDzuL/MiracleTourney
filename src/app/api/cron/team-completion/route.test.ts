import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/registration/completion-repository", () => ({ syncTeamCompletion: sync }));

import { GET } from "./route";

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/team-completion", authorization ? { headers: { authorization } } : undefined);

describe("GET /api/cron/team-completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    sync.mockResolvedValue({ flagged: 1, cleared: 0, emailed: 1, emailFailed: 0, emailSkipped: 0 });
  });

  it("refuses a call without the secret", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("refuses a wrong secret", async () => {
    const response = await GET(request("Bearer nope"));
    expect(response.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("refuses every call when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(request("Bearer "));
    expect(response.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("runs the sync and reports the counts", async () => {
    const response = await GET(request("Bearer test-cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", flagged: 1, cleared: 0, emailed: 1, emailFailed: 0, emailSkipped: 0 });
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
