-- Destructive. The change history/undo feature is gone; production holds no live
-- record_operations rows and its outbox is drained. Earlier releases hid a deleted file
-- (pendingDeletionOperation) until its undo window ended; those windows have all expired, so
-- the deletion is completed here instead of by the removed compatibility handler: the outbox
-- removes the blob only when no other file row shares its path (copied productions).
INSERT INTO "outbox" ("id", "department_id", "type", "payload")
SELECT gen_random_uuid()::text, "department_id", 'FileDeletionRequestedV1',
  jsonb_build_object('path', "data"->>'path', 'fileId', "id", 'actorId', "created_by", 'organizationId', "organization_id")
FROM "records"
WHERE "kind" = 'files' AND coalesce("data"->>'pendingDeletionOperation', '') <> '';
--> statement-breakpoint
DELETE FROM "records" WHERE "kind" = 'files' AND coalesce("data"->>'pendingDeletionOperation', '') <> '';
--> statement-breakpoint
DROP TABLE IF EXISTS "record_operations" CASCADE;
