CREATE TABLE "EventBracketAppearance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "backgroundUrl" TEXT,
    "positionX" INTEGER NOT NULL DEFAULT 50,
    "positionY" INTEGER NOT NULL DEFAULT 50,
    "overlay" INTEGER NOT NULL DEFAULT 35,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventBracketAppearance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventBracketAppearance_eventId_key" ON "EventBracketAppearance"("eventId");
ALTER TABLE "EventBracketAppearance" ADD CONSTRAINT "EventBracketAppearance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
