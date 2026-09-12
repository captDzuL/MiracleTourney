export function buildLegacyUploadAppend(certificate, completedV3, imageUrl, publishedAt) {
  if (completedV3 || certificate.templateVersion !== "legacy-v1" || certificate.completionId) {
    throw new Error("Completion V3 certificates must be managed in Certificate Studio");
  }
  if (certificate.type !== "champion" || certificate.recipientKind !== "team") {
    throw new Error("Legacy upload requires a Champion team certificate");
  }
  const url = new URL(imageUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")
    || url.username || url.password || url.search || url.hash) {
    throw new Error("Legacy upload requires a trusted public Blob URL");
  }
  if (!(publishedAt instanceof Date) || !Number.isFinite(publishedAt.getTime())) {
    throw new Error("Legacy upload requires a valid publication time");
  }
  return {
    eventId: certificate.eventId,
    teamId: certificate.teamId,
    type: "champion",
    recipientKind: "team",
    recipientId: certificate.recipientId,
    recipientName: certificate.recipientName,
    version: certificate.version + 1,
    templateVersion: "legacy-v1",
    imageUrl,
    publishedUrl: imageUrl,
    status: "ready",
    generatedAt: publishedAt,
    publishedAt,
    attemptCount: 1,
  };
}
