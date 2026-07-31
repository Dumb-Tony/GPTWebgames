CREATE TABLE `field_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author` text NOT NULL,
	`category` text DEFAULT 'idea' NOT NULL,
	`content` text NOT NULL,
	`build` text DEFAULT '003' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
