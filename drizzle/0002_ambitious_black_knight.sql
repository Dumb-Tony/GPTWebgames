CREATE TABLE `crew_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`member_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crew_actions_room_id_idx` ON `crew_actions` (`room_code`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `crew_actions_member_sequence_idx` ON `crew_actions` (`member_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `crew_members` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`color_index` integer NOT NULL,
	`role` text NOT NULL,
	`x` integer DEFAULT -12000 NOT NULL,
	`y` integer DEFAULT 0 NOT NULL,
	`z` integer DEFAULT 5000 NOT NULL,
	`yaw` integer DEFAULT 0 NOT NULL,
	`input_mask` integer DEFAULT 0 NOT NULL,
	`action_sequence` integer DEFAULT 0 NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crew_members_room_idx` ON `crew_members` (`room_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `crew_members_token_idx` ON `crew_members` (`token`);--> statement-breakpoint
CREATE TABLE `crew_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_member_id` text NOT NULL,
	`mission_seed` integer NOT NULL,
	`phase` text DEFAULT 'lobby' NOT NULL,
	`authoritative_state` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`action_cursor` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
