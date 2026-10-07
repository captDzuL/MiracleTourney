-- Additive V3 format configuration. The legacy Event.format string remains
-- required during rollout so existing events and rollback paths stay valid.
ALTER TABLE "Event" ADD COLUMN "formatConfig" JSONB;