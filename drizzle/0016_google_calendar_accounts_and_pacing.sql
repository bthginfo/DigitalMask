DROP INDEX "google_calendar_user_scope_idx";--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "calendars" jsonb;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "retry_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_user_account_idx" ON "google_calendar_connections" USING btree ("department_id","user_id","google_subject");
