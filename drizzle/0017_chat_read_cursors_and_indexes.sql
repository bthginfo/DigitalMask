-- Additive: per-channel chat read cursors replace one notification row per chat message.
-- Indexes for bounded unread/notification/file/event/message queries; no data is changed.
CREATE TABLE "chat_reads" (
	"user_id" text NOT NULL,
	"department_id" text NOT NULL,
	"channel_key" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_reads_department_id_user_id_channel_key_pk" PRIMARY KEY("department_id","user_id","channel_key")
);
--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_idempotency_idx" ON "records" USING btree ("department_id","owner_id",("data"->>'idempotencyKey')) WHERE "records"."kind"='messages' and coalesce("records"."data"->>'idempotencyKey','')<>'';--> statement-breakpoint
CREATE INDEX "record_message_time_idx" ON "records" USING btree ("department_id","created_at") WHERE "records"."kind"='messages';--> statement-breakpoint
CREATE INDEX "record_unread_notice_idx" ON "records" USING btree ("department_id","owner_id","created_at") WHERE "records"."kind"='notifications' and coalesce("records"."data"->>'read','false')<>'true';--> statement-breakpoint
CREATE INDEX "record_file_path_idx" ON "records" USING btree ("department_id",("data"->>'path')) WHERE "records"."kind"='files';--> statement-breakpoint
CREATE INDEX "record_file_parent_idx" ON "records" USING btree ("department_id",("data"->>'recordId')) WHERE "records"."kind"='files';--> statement-breakpoint
CREATE INDEX "record_event_end_idx" ON "records" USING btree ("department_id","end_at") WHERE "records"."kind"='events';--> statement-breakpoint
CREATE INDEX "record_event_series_idx" ON "records" USING btree ("department_id","start_at") WHERE "records"."kind"='events' and "records"."data"->>'recurrence' in ('daily','weekly');