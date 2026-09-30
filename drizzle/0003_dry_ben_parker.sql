CREATE TABLE "profile_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"accent_palette" text DEFAULT 'green' NOT NULL,
	"onboarding_version" integer DEFAULT 0 NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_preferences" ADD CONSTRAINT "profile_preferences_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;