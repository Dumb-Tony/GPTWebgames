ALTER TABLE `field_notes` ADD `status` text DEFAULT 'open' NOT NULL;
--> statement-breakpoint
DELETE FROM `field_notes`;
