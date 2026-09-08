import { describe, expect, it } from "vitest";

import {
  evaluateOwnershipMappings,
  formatPreflightSummary,
  decidePreflightExitCode,
  runTenantOwnershipPreflight,
  type TenantOwnershipDataSource,
} from "./preflight";

describe("tenant ownership preflight", () => {
  it("reports clean datasets without anomalies", async () => {
    const report = await runTenantOwnershipPreflight({
      users: [
        { id: "platform-1", role: "platform_admin" },
        { id: "organizer-1", role: "organizer" },
      ],
      events: [
        { id: "event-1", organizerUserId: "organizer-1" },
        { id: "event-2", organizerUserId: "platform-1" },
      ],
    });

    expect(report.adminUserIds).toEqual([]);
    expect(report.nullOwnerEventIds).toEqual([]);
    expect(report.missingOwnerUserEventIds).toEqual([]);
    expect(report.invalidOwnerRoleEventIds).toEqual([]);
    expect(report.hasAnomalies).toBe(false);
    expect(decidePreflightExitCode(report)).toBe(0);
  });

  it("detects every anomaly category in one pass", async () => {
    const report = await runTenantOwnershipPreflight({
      users: [
        { id: "admin-legacy", role: "admin" },
        { id: "captain-1", role: "captain" },
        { id: "platform-1", role: "platform_admin" },
      ],
      events: [
        { id: "event-null", organizerUserId: null },
        { id: "event-missing", organizerUserId: "user-missing" },
        { id: "event-bad-role", organizerUserId: "captain-1" },
        { id: "event-good", organizerUserId: "platform-1" },
      ],
    });

    expect(report.adminUserIds).toEqual(["admin-legacy"]);
    expect(report.nullOwnerEventIds).toEqual(["event-null"]);
    expect(report.missingOwnerUserEventIds).toEqual(["event-missing"]);
    expect(report.invalidOwnerRoleEventIds).toEqual(["event-bad-role"]);
    expect(report.hasAnomalies).toBe(true);
    expect(decidePreflightExitCode(report)).toBe(1);
  });

  it("supports a small injected data source", async () => {
    const dataSource: TenantOwnershipDataSource = {
      async loadUsers() {
        return [{ id: "organizer-2", role: "organizer" }];
      },
      async loadEvents() {
        return [{ id: "event-3", organizerUserId: "organizer-2" }];
      },
    };

    const report = await runTenantOwnershipPreflight({ dataSource });

    expect(report.totalUsers).toBe(1);
    expect(report.totalEvents).toBe(1);
    expect(report.hasAnomalies).toBe(false);
  });

  it("formats summary output with counts and stable IDs only", async () => {
    const report = await runTenantOwnershipPreflight({
      users: [
        {
          id: "admin-legacy",
          role: "admin",
          email: "admin@miraclefc.gg",
          name: "Legacy Admin",
          passwordHash: "$2b$10$super-secret",
          resetToken: "token-123",
        },
        { id: "captain-1", role: "captain", email: "captain@miraclefc.gg" },
      ],
      events: [
        {
          id: "event-null",
          organizerUserId: null,
          organizerEmail: "owner@miraclefc.gg",
        },
      ],
    });

    const output = formatPreflightSummary(report);

    expect(output).toContain("admins: 1");
    expect(output).toContain("null_owner_events: 1");
    expect(output).toContain("admin-legacy");
    expect(output).toContain("event-null");
    expect(output).not.toContain("admin@miraclefc.gg");
    expect(output).not.toContain("captain@miraclefc.gg");
    expect(output).not.toContain("Legacy Admin");
    expect(output).not.toContain("passwordHash");
    expect(output).not.toContain("token-123");
    expect(output).not.toContain("postgresql://");
  });

  it("fails when orphan events do not have explicit mappings", async () => {
    const report = await runTenantOwnershipPreflight({
      users: [
        { id: "organizer-1", role: "organizer" },
      ],
      events: [
        { id: "event-null-a", organizerUserId: null },
        { id: "event-null-b", organizerUserId: null },
      ],
    });

    const validation = evaluateOwnershipMappings(report, {
      orphanEventOwners: {
        "event-null-a": "organizer-1",
      },
      legacyAdminUserIds: [],
    });

    expect(validation.missingEventIds).toEqual(["event-null-b"]);
    expect(validation.unknownEventIds).toEqual([]);
    expect(validation.unknownUserIds).toEqual([]);
    expect(validation.isValid).toBe(false);
  });

  it("fails when mapping references unknown event IDs or owner IDs", async () => {
    const report = await runTenantOwnershipPreflight({
      users: [{ id: "organizer-1", role: "organizer" }],
      events: [{ id: "event-null-a", organizerUserId: null }],
    });

    const validation = evaluateOwnershipMappings(report, {
      orphanEventOwners: {
        "event-null-a": "missing-owner",
        "event-null-z": "organizer-1",
      },
      legacyAdminUserIds: [],
    });

    expect(validation.missingEventIds).toEqual([]);
    expect(validation.unknownEventIds).toEqual(["event-null-z"]);
    expect(validation.unknownUserIds).toEqual(["missing-owner"]);
    expect(validation.isValid).toBe(false);
  });

  it("rejects legacy admin mapping IDs with invalid current roles", async () => {
    const report = await runTenantOwnershipPreflight({
      users: [
        { id: "legacy-platform", role: "platform_admin" },
        { id: "captain-1", role: "captain" },
        { id: "organizer-1", role: "organizer" },
      ],
      events: [{ id: "event-null-a", organizerUserId: null }],
    });

    const validation = evaluateOwnershipMappings(report, {
      orphanEventOwners: {
        "event-null-a": "organizer-1",
      },
      legacyAdminUserIds: ["captain-1"],
    });

    expect(validation.invalidLegacyAdminRoleUserIds).toEqual(["captain-1"]);
    expect(validation.isValid).toBe(false);
  });

  it("treats complete valid mapping as actionable when all legacy admins are listed", async () => {
    const report = await runTenantOwnershipPreflight({
      users: [
        { id: "legacy-platform", role: "platform_admin" },
        { id: "legacy-admin", role: "admin" },
        { id: "organizer-1", role: "organizer" },
      ],
      events: [{ id: "event-null-a", organizerUserId: null }],
    });

    const validation = evaluateOwnershipMappings(report, {
      orphanEventOwners: {
        "event-null-a": "organizer-1",
      },
      legacyAdminUserIds: ["legacy-admin"],
    });

    expect(validation.isValid).toBe(true);
    expect(validation.unresolvedAdminUserIds).toEqual([]);
    expect(validation.isActionable).toBe(true);
    expect(decidePreflightExitCode(report, validation)).toBe(0);
  });

  it("marks preflight as failed for CLI when mapping validation fails", async () => {
    const report = await runTenantOwnershipPreflight({
      users: [{ id: "organizer-1", role: "organizer" }],
      events: [{ id: "event-null-a", organizerUserId: null }],
    });
    const mappingValidation = evaluateOwnershipMappings(report, {
      orphanEventOwners: {},
      legacyAdminUserIds: [],
    });

    expect(decidePreflightExitCode(report, mappingValidation)).toBe(1);
  });
});
