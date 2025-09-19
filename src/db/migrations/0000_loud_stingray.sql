CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`type` text,
	`created_at` integer,
	`last_seen` integer,
	`hide_from_continue_listening` text,
	`download` integer,
	`update` integer,
	`delete` integer,
	`upload` integer,
	`access_all_libraries` integer,
	`access_all_tags` integer,
	`access_explicit_content` integer
);
--> statement-breakpoint
CREATE TABLE `media_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`library_item_id` text NOT NULL,
	`episode_id` text,
	`duration` real,
	`progress` real,
	`current_time` real,
	`is_finished` integer,
	`hide_from_continue_listening` integer,
	`last_update` integer,
	`started_at` integer,
	`finished_at` integer
);
