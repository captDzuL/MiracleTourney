import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readPublicSocialBracket: vi.fn(), renderSocialBracketPng: vi.fn() }));
vi.mock("@/lib/bracket/read", () => ({ readPublicSocialBracket: mocks.readPublicSocialBracket }));
vi.mock("@/lib/bracket/export", () => ({ renderSocialBracketPng: mocks.renderSocialBracketPng }));
import { GET } from "./route";
const params = { params: Promise.resolve({ slug: "cup" }) };
const request = (query = "") => new Request(`https://app.example/api/events/cup/bracket.png${query}`);

describe("public bracket PNG API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.readPublicSocialBracket.mockResolvedValue({ event: { slug: "cup" }, locale: "id", preview: false, matches: [{ roundKey: "single:1" }] }); mocks.renderSocialBracketPng.mockResolvedValue(Buffer.from("png")); });
  it("rejects unknown round keys and unsupported query options before rendering", async () => {
    expect((await GET(request("?round=bogus"), params)).status).toBe(400);
    expect((await GET(request("?url=http://127.0.0.1/"), params)).status).toBe(400);
    expect(mocks.renderSocialBracketPng).not.toHaveBeenCalled();
  });
  it("never exports draft data", async () => {
    mocks.readPublicSocialBracket.mockResolvedValue({ event: { slug: "cup" }, locale: "id", preview: true, matches: [{ roundKey: "single:1" }] });
    expect((await GET(request(), params)).status).toBe(404);
    expect(mocks.renderSocialBracketPng).not.toHaveBeenCalled();
  });
  it("returns a downloadable PNG for an existing round", async () => {
    const response = await GET(request("?locale=id&round=single%3A1"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(await response.arrayBuffer()).toEqual(Uint8Array.from(Buffer.from("png")).buffer);
    expect(mocks.renderSocialBracketPng).toHaveBeenCalledWith(expect.objectContaining({ preview: false }), "single:1");
  });
});
