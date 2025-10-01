CREATE TABLE `local_listening_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`library_item_id` text NOT NULL,
	`media_id` text NOT NULL,
	`session_start` integer NOT NULL,
	`session_end` integer,
	`start_time` real NOT NULL,
	`end_time` real,
	`current_time` real NOT NULL,
	`duration` real NOT NULL,
	`playback_rate` real DEFAULT 1 NOT NULL,
	`volume` real DEFAULT 1 NOT NULL,
	`is_synced` integer DEFAULT false NOT NULL,
	`sync_attempts` integer DEFAULT 0 NOT NULL,
	`last_sync_attempt` integer,
	`sync_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_metadata`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `local_progress_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`current_time` real NOT NULL,
	`progress` real NOT NULL,
	`playback_rate` real NOT NULL,
	`volume` real NOT NULL,
	`chapter_id` text,
	`is_playing` integer NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `local_listening_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
