CREATE TABLE "record_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"department_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"record_id" text NOT NULL,
	"kind" text NOT NULL,
	"operation" text NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"undo_payload" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_operations" ADD CONSTRAINT "record_operations_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_operations" ADD CONSTRAINT "record_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_operations" ADD CONSTRAINT "record_operations_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_operations_scope_time_idx" ON "record_operations" USING btree ("department_id","created_at");--> statement-breakpoint
CREATE INDEX "record_operations_record_idx" ON "record_operations" USING btree ("department_id","record_id","created_at");--> statement-breakpoint
CREATE INDEX "record_operations_expiry_idx" ON "record_operations" USING btree ("expires_at") WHERE "record_operations"."undo_payload" is not null;