import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readOrganizerSocialBracket: vi.fn(), renderSocialBracketPng: vi.fn() }));
vi.mock("@/lib/bracket/read", () => ({ readOrganizerSocialBracket: mocks.readOrganizerSocialBracket }));
vi.mock("@/lib/bracket/export", () => ({ renderSocialBracketPng: mocks.renderSocialBracketPng }));
import { GET } from "./route";
const params = { params: Promise.resolve({ eventId: "event-1" }) };
const request = (query = "") => new Request(`https://app.example/api/organizer/events/event-1/bracket.png${query}`);
describe("organizer bracket PNG API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.readOrganizerSocialBracket.mockResolvedValue({ event: { slug: "cup" }, locale: "id", preview: true, matches: [{ roundKey: "single:1" }] }); mocks.renderSocialBracketPng.mockResolvedValue(Buffer.from("png")); });
  it("requires the ownership-gated reader to return a board", async () => {
    mocks.readOrganizerSocialBracket.mockResolvedValue(null);
    expect((await GET(request(), params)).status).toBe(404);
    expect(mocks.renderSocialBracketPng).not.toHaveBeenCalled();
  });
  it("returns private watermarked preview with no-store", async () => {
    const response = await GET(request("?locale=id&round=single%3A1"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.renderSocialBracketPng).toHaveBeenCalledWith(expect.objectContaining({ preview: true }), "single:1");
  });
});
