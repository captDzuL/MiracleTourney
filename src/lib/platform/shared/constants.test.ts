import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("../db", () => ({ prisma: {} }));

import { eventPublicInclude as repositoryInclude, mapEvent as repositoryMapEvent } from "@/lib/platform/shared/mappers";
import {
  ACTIVE_REGISTRATION_REQUEST_STATUSES,
  CACHE_TAGS,
  EXPIRABLE_REGISTRATION_REQUEST_STATUSES,
  PAYMENT_REQUEST_TTL_MS,
  PUBLIC_EVENT_STATUSES,
  RESERVED_REGISTRATION_REQUEST_STATUSES,
} from "./constants";
import { eventPublicInclude, mapEvent } from "./mappers";

// Refactor PR 1.1: the shared folder holds what repository.ts used to define. These tests pin the values that other
// code and the database rely on, so a move or a rename cannot change them quietly.

const SRC_DIR = path.resolve(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("platform shared constants", () => {
  it("keeps the cache tags the server actions refresh", () => {
    expect(CACHE_TAGS).toEqual({ events: "events", teams: "teams", stats: "stats" });
  });

  it("is the only set of tags: every literal passed to revalidateTag is one of them", () => {
    const known = new Set<string>(Object.values(CACHE_TAGS));
    const unknown: string[] = [];
    for (const file of sourceFiles(SRC_DIR)) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/revalidateTag\(\s*["'`]([^"'`]+)["'`]/g)) {
        if (!known.has(match[1] as string)) unknown.push(`${path.relative(SRC_DIR, file)}: ${match[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("keeps the event statuses that are public", () => {
    expect([...PUBLIC_EVENT_STATUSES].sort()).toEqual(["Finished", "Ongoing", "Published", "Registration Closed"]);
  });

  it("keeps the registration request statuses and the 24 hour payment window", () => {
    expect(ACTIVE_REGISTRATION_REQUEST_STATUSES).toEqual(["pending_payment", "pending_review", "approved"]);
    expect(RESERVED_REGISTRATION_REQUEST_STATUSES).toEqual(["pending_payment", "pending_review"]);
    // pending_review is deliberately not expirable: once proof is uploaded only an admin decision resolves the request.
    expect(EXPIRABLE_REGISTRATION_REQUEST_STATUSES).toEqual(["pending_payment", "rejected"]);
    expect(PAYMENT_REQUEST_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("still exports mapEvent and eventPublicInclude from repository.ts, as the same objects", () => {
    expect(repositoryMapEvent).toBe(mapEvent);
    expect(repositoryInclude).toBe(eventPublicInclude);
  });
});
