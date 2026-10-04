CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`library_item_id` text NOT NULL,
	`title` text NOT NULL,
	`time` real NOT NULL,
	`created_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarks_user_library_idx` ON `bookmarks` (`user_id`,`library_item_id`);--> statement-breakpoint
CREATE TABLE `pending_bookmark_ops` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`library_item_id` text NOT NULL,
	`operation_type` text NOT NULL,
	`bookmark_id` text,
	`time` real NOT NULL,
	`title` text,
	`created_at` integer NOT NULL
);
