import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { prisma, assertUserCanManageEvent } = vi.hoisted(() => ({
  prisma: {
    eventPaymentSettings: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    paymentSettings: { findUnique: vi.fn() },
  },
  assertUserCanManageEvent: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent }));

import {
  getPublishedPaymentSettingsForEvent,
  publishEventPaymentSettings,
  saveEventPaymentSettingsDraft,
} from "./event-payment-settings";

const organizer = { id: "organizer-1", role: "organizer" as const };

const publishedEventSettings = {
  id: "event-settings-1",
  eventId: "event-1",
  qrisImageUrl: "https://blob.example/qris-event-1.png",
  instructions: "Scan QRIS event ini.",
  status: "published",
  version: 3,
  publishedAt: new Date("2026-09-14T10:00:00.000Z"),
  updatedById: organizer.id,
  createdAt: new Date("2026-09-14T09:00:00.000Z"),
  updatedAt: new Date("2026-09-14T10:00:00.000Z"),
};

describe("event payment settings reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertUserCanManageEvent.mockResolvedValue(undefined);
  });

  it("prefers a published event setting over the legacy global setting", async () => {
    prisma.eventPaymentSettings.findFirst.mockResolvedValue(publishedEventSettings);
    prisma.paymentSettings.findUnique.mockResolvedValue({
      id: "global",
      qrisImageUrl: "/payment/global.png",
      instructions: "Global instructions",
    });

    await expect(getPublishedPaymentSettingsForEvent("event-1")).resolves.toMatchObject({
      source: "event",
      id: "event-settings-1",
      eventId: "event-1",
      status: "published",
      version: 3,
      qrisImageUrl: "https://blob.example/qris-event-1.png",
    });
    expect(prisma.eventPaymentSettings.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event-1", status: "published" },
    }));
    expect(prisma.paymentSettings.findUnique).not.toHaveBeenCalled();
  });

  it("hides a draft from captains and falls back to the legacy global setting", async () => {
    prisma.eventPaymentSettings.findFirst.mockResolvedValue(null);
    prisma.paymentSettings.findUnique.mockResolvedValue({
      id: "global",
      qrisImageUrl: "/payment/global.png",
      instructions: "Global instructions",
    });

    await expect(getPublishedPaymentSettingsForEvent("event-1")).resolves.toMatchObject({
      source: "global",
      id: "global",
      qrisImageUrl: "/payment/global.png",
      instructions: "Global instructions",
    });
    expect(prisma.eventPaymentSettings.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event-1", status: "published" },
    }));
  });
});

describe("event payment settings writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertUserCanManageEvent.mockResolvedValue(undefined);
  });

  it("denies an organizer who does not own the event before touching payment data", async () => {
    assertUserCanManageEvent.mockRejectedValue(new Error("Not authorized"));

    await expect(saveEventPaymentSettingsDraft({
      eventId: "event-other",
      actor: organizer,
      expectedVersion: 0,
      qrisImageUrl: "/payment/qris.png",
      instructions: "Pay here",
    })).rejects.toThrow("Not authorized");
    expect(prisma.eventPaymentSettings.findFirst).not.toHaveBeenCalled();
    expect(prisma.eventPaymentSettings.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventPaymentSettings.updateMany).not.toHaveBeenCalled();
    expect(prisma.eventPaymentSettings.create).not.toHaveBeenCalled();
  });

  it("returns a conflict without overwriting a newer draft version", async () => {
    prisma.eventPaymentSettings.findUnique.mockResolvedValue({ ...publishedEventSettings, status: "draft", version: 2 });
    prisma.eventPaymentSettings.updateMany.mockResolvedValue({ count: 0 });

    await expect(saveEventPaymentSettingsDraft({
      eventId: "event-1",
      actor: organizer,
      expectedVersion: 1,
      qrisImageUrl: "/payment/older.png",
      instructions: "Older draft",
    })).resolves.toEqual({ status: "conflict", version: 2 });
    expect(prisma.eventPaymentSettings.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event-1", version: 1 },
    }));
    expect(prisma.paymentSettings.findUnique).not.toHaveBeenCalled();
  });

  it("updates only the event row with a compare-and-swap draft write", async () => {
    const saved = { ...publishedEventSettings, status: "draft", version: 4, publishedAt: null, qrisImageUrl: "/payment/new.png", instructions: "New draft" };
    prisma.eventPaymentSettings.findUnique.mockResolvedValueOnce({ ...publishedEventSettings, version: 3 });
    prisma.eventPaymentSettings.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPaymentSettings.findUnique.mockResolvedValueOnce(saved);

    await expect(saveEventPaymentSettingsDraft({
      eventId: "event-1",
      actor: organizer,
      expectedVersion: 3,
      qrisImageUrl: "/payment/new.png",
      instructions: "New draft",
    })).resolves.toMatchObject({ status: "saved", settings: { version: 4, status: "draft" } });
    expect(prisma.eventPaymentSettings.updateMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", version: 3 },
      data: {
        qrisImageUrl: "/payment/new.png",
        instructions: "New draft",
        status: "draft",
        publishedAt: null,
        updatedById: organizer.id,
        version: { increment: 1 },
      },
    });
    expect(prisma.paymentSettings.findUnique).not.toHaveBeenCalled();
  });

  it("publishes a draft only when the expected version is current", async () => {
    const published = { ...publishedEventSettings, version: 4 };
    prisma.eventPaymentSettings.findUnique.mockResolvedValueOnce({ ...publishedEventSettings, status: "draft", version: 3 });
    prisma.eventPaymentSettings.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventPaymentSettings.findUnique.mockResolvedValueOnce(published);

    await expect(publishEventPaymentSettings({
      eventId: "event-1",
      actor: organizer,
      expectedVersion: 3,
    })).resolves.toMatchObject({ status: "published", settings: { status: "published", version: 4 } });
    expect(prisma.eventPaymentSettings.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event-1", version: 3, status: "draft" },
      data: expect.objectContaining({ status: "published", updatedById: organizer.id, version: { increment: 1 } }),
    }));
    expect(prisma.paymentSettings.findUnique).not.toHaveBeenCalled();
  });
});

describe("event payment settings persistence contract", () => {
  it("adds only the event payment settings table and relations without historical rewrites", () => {
    const schemaPath = fileURLToPath(new URL("../../../prisma/schema.prisma", import.meta.url));
    const migrationPath = fileURLToPath(new URL("../../../prisma/migrations/20260914090000_add_event_payment_settings/migration.sql", import.meta.url));
    expect(existsSync(schemaPath)).toBe(true);
    expect(existsSync(migrationPath), "missing event payment settings migration").toBe(true);
    const schema = readFileSync(schemaPath, "utf8");
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    expect(schema).toContain("model EventPaymentSettings");
    expect(schema).toMatch(/eventId\s+String\s+@unique/);
    expect(schema).toContain("qrisImageUrl");
    expect(schema).toContain("updatedById");
    expect(migration).toContain('CREATE TABLE "EventPaymentSettings"');
    expect(migration).toContain('REFERENCES "Event"("id")');
    expect(migration).not.toMatch(/UPDATE\s+"(Event|User|PaymentSettings|TeamRegistrationRequest)"/i);
  });
});
