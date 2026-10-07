import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/platform/db", () => ({ prisma: { eventBracketAppearance: { findUnique, upsert } } }));
import { getBracketAppearance, saveBracketAppearance } from "./appearance";

beforeEach(() => vi.clearAllMocks());
describe("bracket appearance persistence", () => {
  it("returns safe defaults for an event without settings", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getBracketAppearance("event-1")).toEqual({ backgroundUrl: null, positionX: 50, positionY: 50, overlay: 35 });
  });
  it("returns saved values and scopes the lookup to the event", async () => {
    findUnique.mockResolvedValue({ backgroundUrl: "/bracket-backgrounds/photo.webp", positionX: 25, positionY: 70, overlay: 40 });
    expect(await getBracketAppearance("event-1")).toEqual({ backgroundUrl: "/bracket-backgrounds/photo.webp", positionX: 25, positionY: 70, overlay: 40 });
    expect(findUnique).toHaveBeenCalledWith({ where: { eventId: "event-1" }, select: { backgroundUrl: true, positionX: true, positionY: true, overlay: true } });
  });
  it("saves settings under one event without accepting an arbitrary URL", async () => {
    upsert.mockResolvedValue({ backgroundUrl: null, positionX: 25, positionY: 70, overlay: 40 });
    expect(await saveBracketAppearance("event-1", { positionX: 25, positionY: 70, overlay: 40 })).toEqual({ backgroundUrl: null, positionX: 25, positionY: 70, overlay: 40 });
    expect(upsert).toHaveBeenCalledWith({ where: { eventId: "event-1" }, create: { eventId: "event-1", positionX: 25, positionY: 70, overlay: 40 }, update: { positionX: 25, positionY: 70, overlay: 40 }, select: { backgroundUrl: true, positionX: true, positionY: true, overlay: true } });
  });
});
