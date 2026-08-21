CREATE TABLE "public"."RegistrationImportProfile" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "worksheetName" TEXT,
    "headerSignature" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationImportProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."RegistrationImportBatch" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "profileId" TEXT,
    "createdById" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "worksheetName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."RegistrationImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "normalizedData" JSONB,
    "diff" JSONB,
    "validationErrors" JSONB,
    "teamId" TEXT,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationImportItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistrationImportProfile_eventId_headerSignature_idx" ON "public"."RegistrationImportProfile"("eventId", "headerSignature");
CREATE INDEX "RegistrationImportBatch_eventId_createdAt_idx" ON "public"."RegistrationImportBatch"("eventId", "createdAt");
CREATE INDEX "RegistrationImportBatch_expiresAt_idx" ON "public"."RegistrationImportBatch"("expiresAt");
CREATE INDEX "RegistrationImportItem_batchId_status_idx" ON "public"."RegistrationImportItem"("batchId", "status");

ALTER TABLE "public"."RegistrationImportProfile" ADD CONSTRAINT "RegistrationImportProfile_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RegistrationImportProfile" ADD CONSTRAINT "RegistrationImportProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RegistrationImportBatch" ADD CONSTRAINT "RegistrationImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RegistrationImportBatch" ADD CONSTRAINT "RegistrationImportBatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."RegistrationImportProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."RegistrationImportBatch" ADD CONSTRAINT "RegistrationImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RegistrationImportItem" ADD CONSTRAINT "RegistrationImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."RegistrationImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."RegistrationImportItem" ADD CONSTRAINT "RegistrationImportItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
