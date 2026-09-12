import { expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ view: { mode: "ongoing", stateVersion: "abc" } as unknown, error: false }));
vi.mock("./public-ongoing", () => ({ getPublicOngoingEvent: async () => { if (boundary.error) throw Error("database private detail"); return boundary.view; } }));
import { GET } from "@/app/api/events/[slug]/ongoing/route";
it("serves ETags and bodyless conditional responses without leaking server failures", async () => {
  const context = { params: Promise.resolve({ slug: "cup" }) };
  const first = await GET(new Request("https://test/api/events/cup/ongoing"), context);
  expect(first.status).toBe(200); expect(first.headers.get("etag")).toBe('"abc"');
  const conditional = await GET(new Request("https://test/api/events/cup/ongoing", { headers: { "If-None-Match": '"abc"' } }), context);
  expect(conditional.status).toBe(304); expect(await conditional.text()).toBe("");
  boundary.view = null; expect((await GET(new Request("https://test"), context)).status).toBe(404);
  boundary.error = true; const failure = await GET(new Request("https://test"), context); expect(failure.status).toBe(503); expect(await failure.text()).not.toContain("database");
});
