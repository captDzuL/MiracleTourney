import type { SoloPlan } from "./plan";
import type { SoloRegistrationView } from "./registration-types";
import type { SoloWarning } from "./types";

export type SoloDrawStatus = "draft" | "locked" | "superseded";

export type SoloDrawMember = Readonly<{
  registrationId: string;
  ign: string;
  uid: string;
  /** The position held in this team. */
  position: string;
  isCaptain: boolean;
  willingCaptain: boolean;
}>;

export type SoloDrawTeam = Readonly<{
  /** 1-based. Becomes "Tim N" when the draw is locked. */
  index: number;
  members: readonly SoloDrawMember[];
}>;

/** An approved player who did not make a team. */
export type SoloDrawUnplaced = Readonly<{
  registrationId: string;
  ign: string;
  uid: string;
  primaryPosition: string;
  refundedAt: Date | null;
  /** True for a paid event until the organizer marks the refund as done. */
  needsRefund: boolean;
}>;

/** One draw as the organizer sees it. Never includes WhatsApp numbers. */
export type SoloDrawView = Readonly<{
  id: string;
  eventId: string;
  version: number;
  status: SoloDrawStatus;
  seed: string;
  teamCount: number;
  unplacedCount: number;
  warnings: readonly SoloWarning[];
  canLock: boolean;
  createdAt: Date;
  /** Changes with every swap. The screen sends it back with a swap or a lock, so a stale screen cannot act. */
  updatedAt: Date;
  lockedAt: Date | null;
  teams: readonly SoloDrawTeam[];
  unplaced: readonly SoloDrawUnplaced[];
}>;

/** What closing registration would do, shown before the organizer confirms. */
export type CloseSoloPreview = Readonly<{
  /** Must be settled before registration can close: unpaid, waiting for review, or rejected and still allowed to retry. */
  pendingBlockers: readonly SoloRegistrationView[];
  plan: SoloPlan;
  /** Approved players who will not be in a team. The organizer refunds them. */
  willBeUnplaced: readonly SoloRegistrationView[];
  /** Players in the queue, who are released when registration closes. */
  queuedCount: number;
  feeRequired: boolean;
  /** Pass this back when closing. A changed value means the event changed in between. */
  competitionVersion: number;
}>;
