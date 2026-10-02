CREATE TABLE "collaborative_documents" (
	"file_id" text PRIMARY KEY NOT NULL,
	"format" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"state" text NOT NULL,
	"checkpoint_revision" integer DEFAULT 0 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collaborative_documents" ADD CONSTRAINT "collaborative_documents_file_id_records_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborative_documents" ADD CONSTRAINT "collaborative_documents_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;