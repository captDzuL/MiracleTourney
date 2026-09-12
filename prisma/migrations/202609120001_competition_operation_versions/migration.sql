-- Independent CAS version for competition writes and an explicit public pointer.
ALTER TABLE "Event"
  ADD COLUMN "competitionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "publishedScheduleVersion" INTEGER;
