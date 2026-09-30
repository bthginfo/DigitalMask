CREATE TABLE "attendance_timers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"department_id" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "attendance_timers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "attendance_timers" ADD CONSTRAINT "attendance_timers_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_timers" ADD CONSTRAINT "attendance_timers_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_idempotency_idx" ON "records" USING btree ("department_id","owner_id",("data"->>'idempotencyKey')) WHERE "records"."kind"='attendance' and coalesce("records"."data"->>'idempotencyKey','')<>'';