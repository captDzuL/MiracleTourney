import type { SoloSlotGroup } from "./types";

export type SoloRegistrationStatus =
  | "queued"
  | "pending_payment"
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired"
  | "withdrawn";

/** A registration that holds one of the event's slots. A rejected one keeps it until its deadline passes. */
export const SLOT_HOLDING_STATUSES: readonly SoloRegistrationStatus[] = ["pending_payment", "pending_review", "approved"];

/** Statuses that run out at `expiresAt`. A registration waiting for review never does. */
export const EXPIRABLE_STATUSES: readonly SoloRegistrationStatus[] = ["pending_payment", "rejected"];

export const SOLO_SLOT_GROUPS: readonly SoloSlotGroup[] = ["required", "open"];

/** What the person who owns a registration, or the organizer of its event, may see. Never includes WhatsApp. */
export type SoloRegistrationView = Readonly<{
  id: string;
  eventId: string;
  userId: string;
  ign: string;
  uid: string;
  primaryPosition: string;
  secondaryPosition: string | null;
  slotGroup: SoloSlotGroup;
  willingCaptain: boolean;
  status: SoloRegistrationStatus;
  proofImageUrl: string | null;
  rejectReason: string | null;
  slotHeldAt: Date | null;
  expiresAt: Date | null;
  approvedAt: Date | null;
  withdrawnAt: Date | null;
  refundedAt: Date | null;
  refundNote: string | null;
  version: number;
  createdAt: Date;
}>;

/** A queued player who just received a slot and needs to be told. */
export type PromotedRegistration = Readonly<{
  registrationId: string;
  eventId: string;
  userId: string;
  status: Extract<SoloRegistrationStatus, "pending_payment" | "approved">;
  expiresAt: Date | null;
}>;

export type SoloRegistrationOutcome = "approved" | "pending_payment" | "queued";

export type SlotCounts = Readonly<{ quota: number; held: number; queued: number }>;

export type SoloQuotaSnapshot = Readonly<Record<SoloSlotGroup, SlotCounts>>;
