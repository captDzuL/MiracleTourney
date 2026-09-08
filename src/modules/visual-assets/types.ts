import type { EventVisualAsset, VisualAssetSource, VisualAssetStatus } from "@/lib/platform/types";

export type { EventVisualAsset, VisualAssetSource, VisualAssetStatus };

export type CreateVisualAssetInput = {
  eventId: string;
  source: VisualAssetSource;
  status: VisualAssetStatus;
  url?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  workflowRunId?: string | null;
  sourceUrl?: string | null;
  rightsAttestedAt?: Date | null;
  errorCode?: string | null;
};

export type FocalPoint = { x: number; y: number };

export type ApproveVisualAssetOptions = { dualWriteLegacyImage?: boolean };
