-- Drops indexes no query uses; no data changes. record_chat_idx (department_id, kind, ...)
-- already serves (department_id, kind) lookups; the week sign-off was removed (no writes); the
-- private chat index could not match the coalesce() expressions of the chat queries.
DROP INDEX IF EXISTS "record_scope_kind_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "timesheet_week_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "private_chat_messages_idx";
