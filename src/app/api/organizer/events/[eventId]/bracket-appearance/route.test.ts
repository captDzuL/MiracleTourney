import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), owner: vi.fn(), appearance: vi.fn(), save: vi.fn(), upload: vi.fn(), asset: vi.fn(), revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: m.user }));
vi.mock("@/lib/platform/db", () => ({ prisma: { event: { findUnique: m.owner }, eventVisualAsset: { create: m.asset } } }));
vi.mock("@/lib/bracket/appearance", () => ({ getBracketAppearance: m.appearance, saveBracketAppearance: m.save }));
vi.mock("@/lib/actions", () => ({ uploadImageAsset: m.upload }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath, revalidateTag: m.revalidateTag }));
import { GET, POST } from "./route";
const params = { params: Promise.resolve({ eventId: "event-1" }) };
function post(fields: Record<string, string>, file?: File, origin = "https://app.example") {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  if (file) body.set("background", file);
  return POST(new Request("https://app.example/api/organizer/events/event-1/bracket-appearance", { method: "POST", headers: { origin }, body }), params);
}
const settings = { positionX: "25", positionY: "70", overlay: "40" };
const file = () => new File(["fake"], "test.png", { type: "image/png" });
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ id: "organizer-1", role: "organizer", mustChangePassword: false });
  m.owner.mockResolvedValue({ id: "event-1", organizerUserId: "organizer-1", slug: "event-one" });
  m.appearance.mockResolvedValue({ backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 });
  m.save.mockImplementation(async (_id, input, url) => ({ backgroundUrl: url ?? null, ...input }));
  m.upload.mockResolvedValue({ url: "/bracket-backgrounds/upload.png", mimeType: "image/png", width: 1920, height: 1080, byteSize: 100, storageProvider: "local", storageKey: "bracket-backgrounds/upload.png", contentSha256: "abc" });
});
describe("organizer bracket appearance API", () => {
  it("rejects another organizer before upload", async () => {
    m.owner.mockResolvedValue({ id: "event-1", organizerUserId: "other", slug: "event-one" });
    expect((await post({ action: "upload", rightsAttestation: "confirmed", ...settings }, file())).status).toBe(403);
    expect(m.upload).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
  });
  it("rejects foreign origin before event lookup", async () => {
    expect((await post({ action: "save", ...settings }, undefined, "https://evil.example")).status).toBe(403);
    expect(m.owner).not.toHaveBeenCalled();
  });
  it("validates position and overlay bounds", async () => {
    expect((await post({ action: "save", positionX: "101", positionY: "70", overlay: "81" })).status).toBe(400);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("requires rights attestation", async () => {
    expect((await post({ action: "upload", ...settings }, file())).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it.each(["signature_mismatch", "decode_failed", "file_too_large"])("rejects %s without saving", async code => {
    m.upload.mockRejectedValue(Object.assign(new Error(code), { name: "ImageUploadValidationError", code }));
    const response = await post({ action: "upload", rightsAttestation: "confirmed", ...settings }, file());
    expect(response.status).toBe(400); expect((await response.json()).code).toBe(code);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("saves the validated upload URL and asset rights", async () => {
    const response = await post({ action: "upload", rightsAttestation: "confirmed", ...settings }, file());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ backgroundUrl: "/bracket-backgrounds/upload.png", positionX: 25, positionY: 70, overlay: 40 });
    expect(m.upload).toHaveBeenCalledWith(expect.objectContaining({ maxBytes: 5242880, validationMode: "throw", validatePixels: true, folder: "bracket-backgrounds" }));
    expect(m.asset).toHaveBeenCalledWith({ data: expect.objectContaining({ eventId: "event-1", rightsAttestedAt: expect.any(Date), purpose: "bracket_background" }) });
  });
  it("resets the background", async () => {
    expect((await post({ action: "reset", ...settings })).status).toBe(200);
    expect(m.save).toHaveBeenCalledWith("event-1", { positionX: 25, positionY: 70, overlay: 40 }, null);
  });
  it("reads only for the owner", async () => {
    const response = await GET(new Request("https://app.example/api/organizer/events/event-1/bracket-appearance"), params);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ positionX: 50 });
  });
});
