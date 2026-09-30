CREATE UNIQUE INDEX "department_organization_idx" ON "departments" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "membership_department_scope_fk" FOREIGN KEY ("department_id","organization_id") REFERENCES "public"."departments"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "record_department_scope_fk" FOREIGN KEY ("department_id","organization_id") REFERENCES "public"."departments"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_idempotency_idx" ON "records" USING btree ("department_id","owner_id",("data"->>'idempotencyKey')) WHERE "records"."kind"='time' and coalesce("records"."data"->>'idempotencyKey','')<>'';--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_week_idx" ON "records" USING btree ("department_id","owner_id",("data"->>'week')) WHERE "records"."kind"='timesheets';
