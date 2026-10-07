import { describe, expect, it } from "vitest";
import { CompetitionExpectedError } from "./errors";
import { classifyCompetitionFailure } from "./observability";

describe("competition operation failure classification", () => {
  it.each([
    ["message", Object.assign(new Error("Transaction API error: transaction timed out"), { code: "P2028" }), "transaction_timeout"],
    ["metadata", { code: "P2028", meta: { error: "Transaction already closed: expired" } }, "transaction_timeout"],
    ["message without Prisma code", new Error("interactive transaction timeout while committing"), "transaction_timeout"],
    ["non-timeout P2028", Object.assign(new Error("P2028 unrelated provider failure"), { code: "P2028" }), "internal_error"],
    ["P2028 without metadata", { code: "P2028" }, "internal_error"],
    ["closed P2028", Object.assign(new Error("Transaction already closed"), { code: "P2028" }), "internal_error"],
    ["committed P2028", Object.assign(new Error("Transaction already closed: committed"), { code: "P2028" }), "internal_error"],
    ["closed metadata P2028", { code: "P2028", meta: { error: "Transaction already closed" } }, "internal_error"],
    ["message collision", new Error("database unavailable after conflict and stale lease"), "internal_error"],
    ["expected conflict", new CompetitionExpectedError("conflict", "Version conflict"), "conflict"],
    ["expected unauthorized", new CompetitionExpectedError("unauthorized", "Not authorized"), "unauthorized"],
    ["expected unavailable", new CompetitionExpectedError("unavailable", "Unavailable"), "internal_error"],
    ["expected password change", new CompetitionExpectedError("password_change_required", "Password change required"), "internal_error"],
  ] as const)("returns the safe %s classification", (_label, error, expected) => {
    expect(classifyCompetitionFailure(error)).toBe(expected);
  });
});
