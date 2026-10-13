// Constants and small helpers for projecting public V3 events.
// Moved out of public-v3-read.ts without changes (refactor Phase 4, 4c-v3read).

import { publicV3RouteTargets } from "@/lib/events/public-v3-types";
import type { CompatiblePublicEventInput, CompatiblePublicEventRecord, PublicV3DataSource, PublicV3Match, PublicV3Navigation } from "@/lib/events/public-v3-types";
import { findGameConfig, findGameModeConfig } from "@/lib/platform/config";
import { prisma } from "@/lib/platform/db";
import { assertReaderResultWithinLimit } from "@/lib/platform/reader-bounds";

export const PUBLIC_STATUSES = new Set(["Published", "Registration Closed", "Ongoing", "Finished"]);

export const AWARD_ORDER = ["mvp", "top_scorer", "top_defender", "top_assist"] as const;

export const CERTIFICATE_TYPES = new Set(["champion", "runner_up", "third_place", ...AWARD_ORDER]);

export const EXPECTED_CERTIFICATE_COUNT = 7;

export const PUBLIC_READER_ROW_LIMIT = 500;

export const MAX_REGISTRATION_TEMPLATE_SLOTS = 256;

export type AnyRecord = Record<string, unknown>;

export function record(value: unknown): AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function nonNegative(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function dateText(value: unknown, fallback: string | null = null): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

export function isoDate(value: unknown, fallback: string): string {
  return dateText(value, fallback) ?? fallback;
}

export function eventRecord(input: CompatiblePublicEventInput): CompatiblePublicEventRecord {
  return input.event ?? input.eventRow ?? (record(input) as CompatiblePublicEventRecord);
}

export function statusMode(status: string): "registration" | "drawing" | "ongoing" | "finished" {
  if (status === "Registration Closed") return "drawing";
  if (status === "Ongoing") return "ongoing";
  if (status === "Finished") return "finished";
  return "registration";
}

export function gameIdentity(event: CompatiblePublicEventRecord) {
  const gameId = text(event.gameId, "TBD");
  const modeId = text(event.gameModeId, "TBD");
  const game = findGameConfig(gameId);
  const mode = findGameModeConfig(modeId);
  return {
    id: gameId,
    name: text(event.gameName, game?.name ?? "TBD"),
    modeId,
    modeName: text(event.modeName, mode?.name ?? game?.defaultModeLabel ?? "TBD"),
  };
}

export function statusExplanationKey(mode: "registration" | "drawing" | "ongoing" | "finished", source: PublicV3DataSource): string {
  return mode + "." + source;
}

export function statusExplanationCopy(mode: "registration" | "drawing" | "ongoing" | "finished", source: PublicV3DataSource): string {
  if (mode === "registration") return source === "authoritative"
    ? "Official registration details are available."
    : "Registration details are available from saved event data.";
  if (mode === "drawing") return source === "authoritative"
    ? "The official drawing is published."
    : "The drawing is not yet officially published.";
  if (mode === "ongoing") return source === "authoritative"
    ? "The event is in progress with official schedule and results."
    : "The event is in progress using the latest saved schedule and results.";
  return source === "authoritative"
    ? "The event is complete with official results and published awards."
    : "The event is complete; awards appear after publication is verified.";
}

export function navigation(mode: "registration" | "drawing" | "ongoing" | "finished", format: string, routes: ReturnType<typeof publicV3RouteTargets>): PublicV3Navigation {
  const roundRobin = /league|round.?robin/i.test(format);
  const bracket = mode !== "registration" && !roundRobin;
  return {
    overview: true,
    participants: true,
    schedule: mode !== "registration",
    bracket,
    leaderboard: mode === "ongoing" || mode === "finished" || (mode === "drawing" && roundRobin),
    targets: routes,
  };
}

export function publicBracketKind(value: unknown): PublicV3Match["bracket"] {
  return value === "single" || value === "upper" || value === "lower" || value === "grand_final" || value === "third_place" || value === "round_robin"
    ? value
    : null;
}

export async function callOptional(modelName: string, methodName: string, args: unknown): Promise<unknown> {
  const model = (prisma as unknown as Record<string, unknown>)[modelName] as Record<string, unknown> | undefined;
  const method = model?.[methodName];
  if (typeof method !== "function") return null;
  return (method as (input: unknown) => Promise<unknown>).call(model, args);
}

export function publicReaderRows(resource: string, value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return assertReaderResultWithinLimit(resource, value, PUBLIC_READER_ROW_LIMIT) as unknown[];
}
