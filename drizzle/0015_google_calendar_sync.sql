CREATE TABLE "google_calendar_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"department_id" text NOT NULL,
	"google_subject" text NOT NULL,
	"email" text NOT NULL,
	"credentials" text NOT NULL,
	"calendar_id" text,
	"calendar_name" text,
	"selection" jsonb NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"lock_token" text,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"record_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"google_event_id" text NOT NULL,
	"fingerprint" text DEFAULT '' NOT NULL,
	"etag" text
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_events" ADD CONSTRAINT "google_calendar_events_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_user_scope_idx" ON "google_calendar_connections" USING btree ("department_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_event_source_idx" ON "google_calendar_events" USING btree ("connection_id","calendar_id","record_id");