-- AlterTable
-- Nullable so existing drafts remain valid; each successful autosave records
-- the client-generated mutation UUID that advanced draftRevision.
ALTER TABLE "Event"
    ADD COLUMN "lastDraftMutationId" TEXT;
