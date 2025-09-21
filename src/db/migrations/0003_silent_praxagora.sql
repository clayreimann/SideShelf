CREATE TABLE `media_authors` (
	`media_id` text NOT NULL,
	`author_id` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media_metadata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_genres` (
	`media_id` text NOT NULL,
	`genre_name` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media_metadata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_name`) REFERENCES `genres`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_narrators` (
	`media_id` text NOT NULL,
	`narrator_name` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media_metadata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narrator_name`) REFERENCES `narrators`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_series` (
	`media_id` text NOT NULL,
	`series_id` text NOT NULL,
	`sequence` text,
	FOREIGN KEY (`media_id`) REFERENCES `media_metadata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_tags` (
	`media_id` text NOT NULL,
	`tag_name` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media_metadata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_name`) REFERENCES `tags`(`name`) ON UPDATE no action ON DELETE cascade
);
