CREATE TABLE `libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`display_order` integer,
	`media_type` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`ino` integer,
	`folder_id` text,
	`path` text,
	`rel_path` text,
	`is_file` integer,
	`mtime_ms` real,
	`ctime_ms` real,
	`birthtime_ms` real,
	`added_at` integer,
	`updated_at` integer,
	`last_scan` integer,
	`scan_version` integer,
	`is_missing` integer,
	`is_invalid` integer,
	`media_type` text,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
