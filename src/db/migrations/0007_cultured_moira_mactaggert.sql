CREATE TABLE `local_audio_file_downloads` (
	`audio_file_id` text PRIMARY KEY NOT NULL,
	`is_downloaded` integer DEFAULT true NOT NULL,
	`download_path` text NOT NULL,
	`downloaded_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`audio_file_id`) REFERENCES `audio_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `local_cover_cache` (
	`media_id` text PRIMARY KEY NOT NULL,
	`local_cover_url` text NOT NULL,
	`cached_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media_metadata`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `local_library_file_downloads` (
	`library_file_id` text PRIMARY KEY NOT NULL,
	`is_downloaded` integer DEFAULT true NOT NULL,
	`download_path` text NOT NULL,
	`downloaded_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`library_file_id`) REFERENCES `library_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `audio_files` DROP COLUMN `is_downloaded`;--> statement-breakpoint
ALTER TABLE `audio_files` DROP COLUMN `download_path`;--> statement-breakpoint
ALTER TABLE `audio_files` DROP COLUMN `downloaded_at`;--> statement-breakpoint
ALTER TABLE `library_files` DROP COLUMN `is_downloaded`;--> statement-breakpoint
ALTER TABLE `library_files` DROP COLUMN `download_path`;--> statement-breakpoint
ALTER TABLE `library_files` DROP COLUMN `downloaded_at`;