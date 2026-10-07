CREATE TYPE "AnnouncementUrgency" AS ENUM ('info', 'important', 'urgent');
ALTER TABLE "EventAnnouncement"
  ADD COLUMN "urgency" "AnnouncementUrgency" NOT NULL DEFAULT 'info';
