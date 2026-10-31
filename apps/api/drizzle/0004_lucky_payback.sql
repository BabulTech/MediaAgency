DROP TABLE "user_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "failed_logins";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "locked_until";