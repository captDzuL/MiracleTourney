import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/security/public-error";

const { prisma, tx, applyEventLifecycleSideEffects, bcryptHash } = vi.hoisted(() => ({
  prisma: {
    event: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    eventStream: { upsert: vi.fn() },
    eventSlugRedirect: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    event: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    organizerProfile: { upsert: vi.fn(), create: vi.fn() },
    user: { create: vi.fn() },
  },
  applyEventLifecycleSideEffects: vi.fn(),
  bcryptHash: vi.fn(),
}));

vi.mock("@/lib/platform/db", () => ({ prisma }));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/events/event-lifecycle", () => ({ applyEventLifecycleSideEffects }));
vi.mock("bcryptjs", () => ({ default: { hash: bcryptHash } }));

import {
  autoTransitionEventToOngoing,
  createEvent,
  createOrganizerAndEventDraft,
  getPublicEventSlugRedirect,
  updateEventOrganizerContact,
  updateEventStream,
} from "@/lib/events/repository";
import type { AppUser } from "@/lib/platform/types";

const organizer: AppUser = { id: "org-1", role: "organizer", email: "org@test.com", name: "Organizer User" };
const platformAdmin: AppUser = { id: "admin-1", role: "platform_admin", email: "admin@test.com", name: "Admin" };
const admin: AppUser = { id: "admin-2", role: "admin", email: "admin2@test.com", name: "Admin Two" };

const NOW = new Date("2026-03-01T10:00:00.000Z");

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    slug: "flashpeak-cup",
    name: "Flashpeak Cup",
    description: "Cup description",
    logoUrl: "/logos/cup.png",
    gameImageUrl: null,
    gameId: "game-flashpeak",
    gameModeId: "mode-flashpeak-5v5",
    format: "Single Elimination",
    status: "Draft",
    participantCap: 16,
    registrationWindow: "TBD",
    startsAt: "TBD",
    venue: "Online",
    registrationFeeRequired: false,
    stream: null,
    ...overrides,
  };
}

const singleEliminationConfig = {
  version: 1 as const,
  kind: "single_elimination" as const,
  bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 3, final: 5 },
  thirdPlace: "required" as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  bcryptHash.mockResolvedValue("hashed-password");
});

describe("updateEventOrganizerContact", () => {
  const input = { eventId: "event-1", contactChannel: "WhatsApp", contactValue: "+62812345" };

  it("scopes an organizer to their own event and upserts the profile of the event owner", async () => {
    // Arrange
    tx.event.findFirst.mockResolvedValue({ organizerUserId: "org-1", organizerName: "Miracle Org" });
    tx.organizerProfile.upsert.mockResolvedValue({});

    // Act
    const result = await updateEventOrganizerContact(organizer, input);

    // Assert
    expect(result).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", organizerUserId: "org-1" },
      select: { organizerUserId: true, organizerName: true },
    });
    expect(tx.organizerProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "org-1" },
      update: { contactChannel: "WhatsApp", contactValue: "+62812345" },
      create: {
        userId: "org-1",
        organizationName: "Miracle Org",
        contactChannel: "WhatsApp",
        contactValue: "+62812345",
      },
    });
  });

  it.each([
    ["platform_admin", platformAdmin],
    ["admin", admin],
  ])("does not filter by owner for %s and updates the profile of the event owner, not the actor", async (_role, actor) => {
    // Arrange
    tx.event.findFirst.mockResolvedValue({ organizerUserId: "org-9", organizerName: "Other Org" });

    // Act
    await updateEventOrganizerContact(actor, input);

    // Assert
    expect(tx.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1" },
      select: { organizerUserId: true, organizerName: true },
    });
    expect(tx.organizerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "org-9" },
        create: expect.objectContaining({ userId: "org-9", organizationName: "Other Org" }),
      }),
    );
  });

  it("falls back to the acting user name for the organization name when the event has none", async () => {
    // Arrange
    tx.event.findFirst.mockResolvedValue({ organizerUserId: "org-1", organizerName: null });

    // Act
    await updateEventOrganizerContact(organizer, input);

    // Assert
    expect(tx.organizerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ organizationName: "Organizer User" }),
      }),
    );
  });

  it("keeps an empty organizer name instead of falling back to the user name", async () => {
    // Arrange
    tx.event.findFirst.mockResolvedValue({ organizerUserId: "org-1", organizerName: "" });

    // Act
    await updateEventOrganizerContact(organizer, input);

    // Assert
    expect(tx.organizerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ organizationName: "" }) }),
    );
  });

  it("throws Not authorized and writes nothing when the event is not found for the user", async () => {
    // Arrange
    tx.event.findFirst.mockResolvedValue(null);

    // Act + Assert
    await expect(updateEventOrganizerContact(organizer, input)).rejects.toThrow("Not authorized");
    expect(tx.organizerProfile.upsert).not.toHaveBeenCalled();
  });

  it("throws Not authorized when the event has no organizer user", async () => {
    // Arrange
    tx.event.findFirst.mockResolvedValue({ organizerUserId: null, organizerName: "Orphan" });

    // Act + Assert
    await expect(updateEventOrganizerContact(platformAdmin, input)).rejects.toThrow("Not authorized");
    expect(tx.organizerProfile.upsert).not.toHaveBeenCalled();
  });

  it("propagates a database error from the upsert", async () => {
    // Arrange
    tx.event.findFirst.mockResolvedValue({ organizerUserId: "org-1", organizerName: "Org" });
    tx.organizerProfile.upsert.mockRejectedValue(new Error("db down"));

    // Act + Assert
    await expect(updateEventOrganizerContact(organizer, input)).rejects.toThrow("db down");
  });
});

describe("getPublicEventSlugRedirect", () => {
  it("looks the redirect up by old slug and selects only the target slug and status", async () => {
    // Arrange
    prisma.eventSlugRedirect.findUnique.mockResolvedValue(null);

    // Act
    await getPublicEventSlugRedirect("old-slug");

    // Assert
    expect(prisma.eventSlugRedirect.findUnique).toHaveBeenCalledWith({
      where: { oldSlug: "old-slug" },
      select: { event: { select: { slug: true, status: true } } },
    });
  });

  it.each(["Published", "Registration Closed", "Ongoing", "Finished"])(
    "returns the current slug when the target event is %s",
    async (status) => {
      // Arrange
      prisma.eventSlugRedirect.findUnique.mockResolvedValue({ event: { slug: "new-slug", status } });

      // Act
      const slug = await getPublicEventSlugRedirect("old-slug");

      // Assert
      expect(slug).toBe("new-slug");
    },
  );

  it("returns null when the target event is still a Draft", async () => {
    // Arrange
    prisma.eventSlugRedirect.findUnique.mockResolvedValue({ event: { slug: "new-slug", status: "Draft" } });

    // Act
    const slug = await getPublicEventSlugRedirect("old-slug");

    // Assert
    expect(slug).toBeNull();
  });

  it("returns null when the target event has an unknown status", async () => {
    // Arrange
    prisma.eventSlugRedirect.findUnique.mockResolvedValue({ event: { slug: "new-slug", status: "Archived" } });

    // Act
    const slug = await getPublicEventSlugRedirect("old-slug");

    // Assert
    expect(slug).toBeNull();
  });

  it("returns null when no redirect exists for the slug", async () => {
    // Arrange
    prisma.eventSlugRedirect.findUnique.mockResolvedValue(null);

    // Act
    const slug = await getPublicEventSlugRedirect("missing");

    // Assert
    expect(slug).toBeNull();
  });

  it("propagates a database error", async () => {
    // Arrange
    prisma.eventSlugRedirect.findUnique.mockRejectedValue(new Error("timeout"));

    // Act + Assert
    await expect(getPublicEventSlugRedirect("old-slug")).rejects.toThrow("timeout");
  });
});

describe("createOrganizerAndEventDraft", () => {
  const input = {
    actorId: "admin-1",
    organizer: {
      name: "Rina Organizer",
      organizationName: "Rina Esports",
      email: "rina@example.com",
      contactChannel: "WhatsApp",
      contactValue: "+62811111",
      temporaryPassword: "Temp-Pass-123",
    },
    event: {
      name: "Rina Cup",
      slug: "rina-cup",
      gameModeId: "mode-mlbb-5v5",
      format: "Single Elimination" as const,
      participantCap: 16 as const,
      organizerName: "Rina Esports",
    },
  };

  function arrangeCreated() {
    tx.user.create.mockResolvedValue({
      id: "user-new",
      email: "rina@example.com",
      name: "Rina Organizer",
      role: "organizer",
      mustChangePassword: true,
    });
    tx.organizerProfile.create.mockResolvedValue({});
    tx.event.create.mockResolvedValue(
      eventRow({
        id: "event-new",
        slug: "rina-cup",
        name: "Rina Cup",
        gameId: "game-mobile-legends",
        gameModeId: "mode-mlbb-5v5",
        organizerUserId: "user-new",
        organizerName: "Rina Esports",
        organizerVerified: false,
      }),
    );
  }

  it("hashes the temporary password with cost 10 and stores only the hash on the new organizer", async () => {
    // Arrange
    arrangeCreated();

    // Act
    await createOrganizerAndEventDraft(input);

    // Assert
    expect(bcryptHash).toHaveBeenCalledWith("Temp-Pass-123", 10);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: "rina@example.com",
        name: "Rina Organizer",
        role: "organizer",
        passwordHash: "hashed-password",
        mustChangePassword: true,
      },
    });
    expect(JSON.stringify(tx.user.create.mock.calls)).not.toContain("Temp-Pass-123");
  });

  it("creates the organizer profile for the new user from the organizer input", async () => {
    // Arrange
    arrangeCreated();

    // Act
    await createOrganizerAndEventDraft(input);

    // Assert
    expect(tx.organizerProfile.create).toHaveBeenCalledWith({
      data: {
        userId: "user-new",
        organizationName: "Rina Esports",
        contactChannel: "WhatsApp",
        contactValue: "+62811111",
      },
    });
  });

  it("creates a Draft event owned by the new organizer with defaults and the game resolved from the mode", async () => {
    // Arrange
    arrangeCreated();

    // Act
    await createOrganizerAndEventDraft(input);

    // Assert
    expect(tx.event.create).toHaveBeenCalledWith({
      data: {
        slug: "rina-cup",
        name: "Rina Cup",
        description: "New event created from platform admin.",
        gameId: "game-mobile-legends",
        gameModeId: "mode-mlbb-5v5",
        format: "Single Elimination",
        formatConfig: undefined,
        status: "Draft",
        participantCap: 16,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: "user-new",
        organizerName: "Rina Esports",
        organizerVerified: false,
      },
      include: { stream: true },
    });
  });

  it("passes a provided format config through to the event", async () => {
    // Arrange
    arrangeCreated();

    // Act
    await createOrganizerAndEventDraft({
      ...input,
      event: { ...input.event, formatConfig: singleEliminationConfig },
    });

    // Assert
    expect(tx.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ formatConfig: singleEliminationConfig }),
      }),
    );
  });

  it("returns the mapped organizer flagged for password change and the mapped event", async () => {
    // Arrange
    arrangeCreated();

    // Act
    const result = await createOrganizerAndEventDraft(input);

    // Assert
    expect(result.organizer).toEqual({
      id: "user-new",
      email: "rina@example.com",
      name: "Rina Organizer",
      role: "organizer",
      mustChangePassword: true,
    });
    expect(result.event).toMatchObject({
      id: "event-new",
      slug: "rina-cup",
      status: "Draft",
      gameId: "game-mobile-legends",
      organizerUserId: "user-new",
      organizerName: "Rina Esports",
      organizerVerified: false,
    });
  });

  it("runs the three writes inside one transaction", async () => {
    // Arrange
    arrangeCreated();

    // Act
    await createOrganizerAndEventDraft(input);

    // Assert
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.organizerProfile.create).toHaveBeenCalledTimes(1);
    expect(tx.event.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown game mode before opening a transaction", async () => {
    // Act + Assert
    await expect(
      createOrganizerAndEventDraft({ ...input, event: { ...input.event, gameModeId: "mode-unknown" } }),
    ).rejects.toThrow("Unknown game mode config: mode-unknown");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("propagates a duplicate email error and creates no profile or event", async () => {
    // Arrange
    tx.user.create.mockRejectedValue(new Error("Unique constraint failed on email"));

    // Act + Assert
    await expect(createOrganizerAndEventDraft(input)).rejects.toThrow("Unique constraint failed on email");
    expect(tx.organizerProfile.create).not.toHaveBeenCalled();
    expect(tx.event.create).not.toHaveBeenCalled();
  });

  it("propagates an event creation error so the transaction can roll back", async () => {
    // Arrange
    tx.user.create.mockResolvedValue({ id: "user-new", email: "rina@example.com", name: "Rina Organizer", role: "organizer" });
    tx.organizerProfile.create.mockResolvedValue({});
    tx.event.create.mockRejectedValue(new Error("Unique constraint failed on slug"));

    // Act + Assert
    await expect(createOrganizerAndEventDraft(input)).rejects.toThrow("Unique constraint failed on slug");
  });

  it("propagates a hashing error without opening a transaction", async () => {
    // Arrange
    bcryptHash.mockRejectedValue(new Error("hash failed"));

    // Act + Assert
    await expect(createOrganizerAndEventDraft(input)).rejects.toThrow("hash failed");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("createEvent", () => {
  const baseInput = {
    name: "Spring Cup",
    slug: "spring-cup",
    gameModeId: "mode-flashpeak-5v5",
    format: "League" as const,
    participantCap: 8 as const,
  };

  it("creates a Draft event with default description, venue and dates and resolves the game from the mode", async () => {
    // Arrange
    prisma.event.create.mockResolvedValue(eventRow({ slug: "spring-cup", name: "Spring Cup", format: "League", participantCap: 8 }));

    // Act
    await createEvent(baseInput);

    // Assert
    expect(prisma.event.create).toHaveBeenCalledWith({
      data: {
        slug: "spring-cup",
        name: "Spring Cup",
        description: "New event created from admin panel.",
        gameId: "game-flashpeak",
        gameModeId: "mode-flashpeak-5v5",
        format: "League",
        formatConfig: undefined,
        status: "Draft",
        participantCap: 8,
        registrationWindow: "TBD",
        startsAt: "TBD",
        venue: "Online",
        organizerUserId: undefined,
        organizerName: undefined,
        organizerVerified: false,
      },
      include: { stream: true },
    });
  });

  it("resolves a different game for a different mode", async () => {
    // Arrange
    prisma.event.create.mockResolvedValue(eventRow());

    // Act
    await createEvent({ ...baseInput, gameModeId: "mode-mlbb-5v5" });

    // Assert
    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gameId: "game-mobile-legends", gameModeId: "mode-mlbb-5v5" }),
      }),
    );
  });

  it("stores the organizer ownership fields and format config when provided", async () => {
    // Arrange
    prisma.event.create.mockResolvedValue(eventRow());

    // Act
    await createEvent({
      ...baseInput,
      format: "Single Elimination",
      formatConfig: singleEliminationConfig,
      organizerUserId: "org-1",
      organizerName: "Miracle Org",
      organizerVerified: true,
    });

    // Assert
    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          format: "Single Elimination",
          formatConfig: singleEliminationConfig,
          organizerUserId: "org-1",
          organizerName: "Miracle Org",
          organizerVerified: true,
        }),
      }),
    );
  });

  it("keeps organizerVerified false when it is explicitly false", async () => {
    // Arrange
    prisma.event.create.mockResolvedValue(eventRow());

    // Act
    await createEvent({ ...baseInput, organizerVerified: false });

    // Assert
    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizerVerified: false }) }),
    );
  });

  it("does not use a transaction", async () => {
    // Arrange
    prisma.event.create.mockResolvedValue(eventRow());

    // Act
    await createEvent(baseInput);

    // Assert
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns the created row mapped to an event", async () => {
    // Arrange
    prisma.event.create.mockResolvedValue(
      eventRow({
        id: "event-9",
        slug: "spring-cup",
        name: "Spring Cup",
        format: "League",
        participantCap: 8,
        organizerUserId: "org-1",
        organizerName: "Miracle Org",
        organizerVerified: true,
        formatConfig: null,
      }),
    );

    // Act
    const event = await createEvent(baseInput);

    // Assert
    expect(event).toEqual({
      id: "event-9",
      slug: "spring-cup",
      name: "Spring Cup",
      description: "Cup description",
      gameId: "game-flashpeak",
      gameModeId: "mode-flashpeak-5v5",
      format: "League",
      status: "Draft",
      participantCap: 8,
      registrationWindow: "TBD",
      startsAt: "TBD",
      venue: "Online",
      registrationFeeRequired: false,
      logoUrl: "/logos/cup.png",
      organizerUserId: "org-1",
      organizerName: "Miracle Org",
      organizerVerified: true,
    });
  });

  it("rejects an unknown game mode and writes nothing", async () => {
    // Act + Assert
    await expect(createEvent({ ...baseInput, gameModeId: "mode-unknown" })).rejects.toThrow(
      "Unknown game mode config: mode-unknown",
    );
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it("propagates a database error such as a duplicate slug", async () => {
    // Arrange
    prisma.event.create.mockRejectedValue(new Error("Unique constraint failed on slug"));

    // Act + Assert
    await expect(createEvent(baseInput)).rejects.toThrow("Unique constraint failed on slug");
  });
});

describe("autoTransitionEventToOngoing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves a Published or Registration Closed event to Ongoing and applies lifecycle side effects with the current time", async () => {
    // Arrange
    tx.event.updateMany.mockResolvedValue({ count: 1 });

    // Act
    const result = await autoTransitionEventToOngoing("event-1");

    // Assert
    expect(result).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", status: { in: ["Published", "Registration Closed"] } },
      data: { status: "Ongoing" },
    });
    expect(applyEventLifecycleSideEffects).toHaveBeenCalledTimes(1);
    expect(applyEventLifecycleSideEffects).toHaveBeenCalledWith(tx, "event-1", "Ongoing", NOW);
  });

  it("applies lifecycle side effects once even when several rows are reported as updated", async () => {
    // Arrange
    tx.event.updateMany.mockResolvedValue({ count: 3 });

    // Act
    await autoTransitionEventToOngoing("event-1");

    // Assert
    expect(applyEventLifecycleSideEffects).toHaveBeenCalledTimes(1);
  });

  it("does nothing else when the event was not in a transitionable status (idempotent)", async () => {
    // Arrange
    tx.event.updateMany.mockResolvedValue({ count: 0 });

    // Act
    await autoTransitionEventToOngoing("event-1");

    // Assert
    expect(applyEventLifecycleSideEffects).not.toHaveBeenCalled();
  });

  it("propagates an error from the lifecycle side effects so the transaction rolls back", async () => {
    // Arrange
    tx.event.updateMany.mockResolvedValue({ count: 1 });
    applyEventLifecycleSideEffects.mockRejectedValue(new Error("revoke failed"));

    // Act + Assert
    await expect(autoTransitionEventToOngoing("event-1")).rejects.toThrow("revoke failed");
  });

  it("propagates an error from the status update and skips the side effects", async () => {
    // Arrange
    tx.event.updateMany.mockRejectedValue(new Error("db down"));

    // Act + Assert
    await expect(autoTransitionEventToOngoing("event-1")).rejects.toThrow("db down");
    expect(applyEventLifecycleSideEffects).not.toHaveBeenCalled();
  });
});

describe("updateEventStream", () => {
  const streamedRow = (overrides: Record<string, unknown> = {}) =>
    eventRow({
      status: "Ongoing",
      stream: { platform: "youtube", url: "https://www.youtube.com/watch?v=abc123", label: "Main stage", enabled: true, isLive: true },
      ...overrides,
    });

  beforeEach(() => {
    prisma.$transaction.mockImplementation(async (operation: (tx: typeof prisma) => unknown) => operation(prisma));
  });

  it("reads the event, writes the stream and reloads the event inside one transaction", async () => {
    prisma.event.findUnique.mockResolvedValueOnce(eventRow()).mockResolvedValueOnce(streamedRow());

    await updateEventStream("event-1", "https://www.youtube.com/watch?v=abc123", "Main stage");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it("returns null without writing a stream when the event does not exist", async () => {
    // Arrange
    prisma.event.findUnique.mockResolvedValue(null);

    // Act
    const result = await updateEventStream("missing", "https://www.youtube.com/watch?v=abc123", "Main stage");

    // Assert
    expect(result).toBeNull();
    expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: "missing" } });
    expect(prisma.eventStream.upsert).not.toHaveBeenCalled();
  });

  it("upserts an enabled, live youtube stream for a youtube watch URL", async () => {
    // Arrange
    const url = "https://www.youtube.com/watch?v=abc123";
    prisma.event.findUnique.mockResolvedValueOnce(eventRow()).mockResolvedValueOnce(streamedRow());

    // Act
    await updateEventStream("event-1", url, "Main stage");

    // Assert
    expect(prisma.eventStream.upsert).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      update: { platform: "youtube", url, label: "Main stage", enabled: true, isLive: true },
      create: { eventId: "event-1", platform: "youtube", url, label: "Main stage", enabled: true, isLive: true },
    });
  });

  it.each([
    ["https://youtu.be/xyz789?t=10", "youtube"],
    ["https://www.tiktok.com/@miracle/live", "tiktok"],
    ["https://example.com/live", "external"],
  ])("detects the platform of %s as %s", async (url, platform) => {
    // Arrange
    prisma.event.findUnique.mockResolvedValueOnce(eventRow()).mockResolvedValueOnce(streamedRow());

    // Act
    await updateEventStream("event-1", url, "Stream");

    // Assert
    expect(prisma.eventStream.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ platform, url }),
        create: expect.objectContaining({ platform, url }),
      }),
    );
  });

  it("reloads the event with its stream after the upsert and returns it mapped", async () => {
    // Arrange
    const url = "https://www.youtube.com/watch?v=abc123";
    prisma.event.findUnique.mockResolvedValueOnce(eventRow()).mockResolvedValueOnce(streamedRow());

    // Act
    const event = await updateEventStream("event-1", url, "Main stage");

    // Assert
    expect(prisma.event.findUnique).toHaveBeenNthCalledWith(1, { where: { id: "event-1" } });
    expect(prisma.event.findUnique).toHaveBeenNthCalledWith(2, { where: { id: "event-1" }, include: { stream: true } });
    expect(prisma.eventStream.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.event.findUnique.mock.invocationCallOrder[1] as number,
    );
    expect(event?.id).toBe("event-1");
    expect(event?.stream).toEqual({ platform: "youtube", url, label: "Main stage", enabled: true, isLive: true });
  });

  it("returns null when the event disappears between the upsert and the reload", async () => {
    // Arrange
    prisma.event.findUnique.mockResolvedValueOnce(eventRow()).mockResolvedValueOnce(null);

    // Act
    const event = await updateEventStream("event-1", "https://example.com/live", "Stream");

    // Assert
    expect(event).toBeNull();
    expect(prisma.eventStream.upsert).toHaveBeenCalledTimes(1);
  });

  it("refuses a link that is not a full URL with a message the user may read, and writes nothing", async () => {
    // Arrange
    prisma.event.findUnique.mockResolvedValueOnce(eventRow());

    // Act
    const failure = await updateEventStream("event-1", "youtube.com/watch?v=abc123", "Stream").catch((error: unknown) => error);

    // Assert
    expect(failure).toBeInstanceOf(UserFacingError);
    expect((failure as Error).message).toBe("Link live stream tidak valid. Pakai alamat lengkap yang diawali https://.");
    expect(prisma.eventStream.upsert).not.toHaveBeenCalled();
  });

  it("propagates an upsert error and does not reload the event", async () => {
    // Arrange
    prisma.event.findUnique.mockResolvedValueOnce(eventRow());
    prisma.eventStream.upsert.mockRejectedValue(new Error("db down"));

    // Act + Assert
    await expect(updateEventStream("event-1", "https://example.com/live", "Stream")).rejects.toThrow("db down");
    expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
  });
});
