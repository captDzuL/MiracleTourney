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

export async function appendLegacyUploadInSerializableTransaction(prisma, eventId, imageUrl, publishedAt) {
  return prisma.$transaction(async (tx) => {
    const [v3Completion, v3Champion, latestLegacy] = await Promise.all([
      tx.tournamentCompletion.findFirst({
        where: { eventId },
        select: { id: true },
      }),
      tx.certificate.findFirst({
        where: { eventId, type: "champion", templateVersion: "miracle-v3" },
        select: { id: true },
      }),
      tx.certificate.findFirst({
        where: {
          eventId,
          type: "champion",
          recipientKind: "team",
          templateVersion: "legacy-v1",
          completionId: null,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      }),
    ]);
    const v3Ownership = v3Completion ?? v3Champion;
    if (v3Ownership) throw new Error("Completion V3 certificates must be managed in Certificate Studio");
    if (!latestLegacy) throw new Error("No legacy certificate is available to append");
    const data = buildLegacyUploadAppend(latestLegacy, null, imageUrl, publishedAt);
    return tx.certificate.create({ data });
  }, { isolationLevel: "Serializable" });
}
