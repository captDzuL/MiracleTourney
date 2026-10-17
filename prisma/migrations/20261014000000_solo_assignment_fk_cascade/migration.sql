-- A placement only means something next to its registration. RESTRICT made deleting an event fail as soon as it had a
-- draw, because the event removes its registrations and draws in the same delete. CASCADE removes the placements with
-- their registration. Teams and players created by a locked draw have no link to these rows and stay as they are.
-- Fail fast instead of queueing behind a long transaction and holding up every registration write.
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SoloDrawAssignment_eventId_registrationId_fkey'
      AND conrelid = '"SoloDrawAssignment"'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'SoloDrawAssignment_eventId_registrationId_fkey'
        AND conrelid = '"SoloDrawAssignment"'::regclass
        AND confdeltype <> 'c'
    ) THEN
      ALTER TABLE "SoloDrawAssignment" DROP CONSTRAINT "SoloDrawAssignment_eventId_registrationId_fkey";
      ALTER TABLE "SoloDrawAssignment" ADD CONSTRAINT "SoloDrawAssignment_eventId_registrationId_fkey" FOREIGN KEY ("eventId", "registrationId") REFERENCES "SoloRegistration"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  ELSE
    ALTER TABLE "SoloDrawAssignment" ADD CONSTRAINT "SoloDrawAssignment_eventId_registrationId_fkey" FOREIGN KEY ("eventId", "registrationId") REFERENCES "SoloRegistration"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
