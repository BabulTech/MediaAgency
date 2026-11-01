ALTER TABLE "orders" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sent_on" date;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sent_via" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sent_note" text;