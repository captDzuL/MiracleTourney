// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startPublicOngoingPolling } from "./public-ongoing-poll";
import type { PublicOngoingEventViewModel } from "./public-ongoing-types";
const state = { stateVersion: "v1", liveMatches: [], nextMatches: [] } as unknown as PublicOngoingEventViewModel;
let stop: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); });
afterEach(() => { stop?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("uses conditional requests, switches to 10 seconds for live state, and keeps good data on 304", async () => {
  const requests: RequestInit[] = []; const received: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => { requests.push(init); return requests.length === 1 ? new Response(JSON.stringify({ ...state, stateVersion: "v2", liveMatches: [{ id: "live" }] }), { status: 200 }) : new Response(null, { status: 304 }); });
  stop = startPublicOngoingPolling({ slug: "cup", initial: state, onData: s => received.push(s.stateVersion), onError: () => {} });
  await vi.advanceTimersByTimeAsync(29999); expect(received).toEqual([]);
  await vi.advanceTimersByTimeAsync(1); expect(received).toEqual(["v2"]);
  expect(requests[0].headers).toMatchObject({ "If-None-Match": '"v1"' });
  await vi.advanceTimersByTimeAsync(10000); expect(requests).toHaveLength(2); expect(received).toEqual(["v2"]);
  expect(requests[1].headers).toMatchObject({ "If-None-Match": '"v2"' });
});
it("pauses while hidden, refreshes on focus, aborts superseded work, and cleans up", async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => { signals.push(init.signal!); return new Promise(() => {}); });
  stop = startPublicOngoingPolling({ slug: "cup", initial: state, onData: () => {}, onError: () => {} });
  window.dispatchEvent(new Event("focus")); expect(signals).toHaveLength(1);
  window.dispatchEvent(new Event("focus")); expect(signals[0].aborted).toBe(true);
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange"));
  expect(signals[1].aborted).toBe(true); await vi.advanceTimersByTimeAsync(90000); expect(signals).toHaveLength(2);
  stop(); window.dispatchEvent(new Event("focus")); expect(signals).toHaveLength(2);
});
it("retains data on failure, exponentially backs off, then recovers", async () => {
  let count = 0; const errors: boolean[] = []; const data: string[] = [];
  vi.stubGlobal("fetch", async () => { count++; if (count < 3) throw Error("offline"); return new Response(JSON.stringify(state)); });
  stop = startPublicOngoingPolling({ slug: "cup", initial: state, onData: s => data.push(s.stateVersion), onError: e => errors.push(e) });
  await vi.advanceTimersByTimeAsync(30000); expect(errors).toEqual([true]); expect(data).toEqual([]);
  await vi.advanceTimersByTimeAsync(59999); expect(count).toBe(1);
  await vi.advanceTimersByTimeAsync(1); expect(count).toBe(2);
  await vi.advanceTimersByTimeAsync(120000); expect(data).toEqual(["v1"]); expect(errors.at(-1)).toBe(false);
});
it("returns control to the canonical renderer when ongoing becomes unavailable", async () => {
  let fallback = 0; let requests = 0;
  vi.stubGlobal("fetch", async () => { requests++; return new Response(null, { status: 404 }); });
  stop = startPublicOngoingPolling({ slug: "cup", initial: state, onData: () => {}, onError: () => {}, onUnavailable: () => { fallback++; } });
  await vi.advanceTimersByTimeAsync(30000); expect(fallback).toBe(1);
  await vi.advanceTimersByTimeAsync(120000); expect(requests).toBe(1);
});
