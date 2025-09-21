CREATE TABLE `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`image_url` text,
	`num_books` integer
);
--> statement-breakpoint
CREATE TABLE `genres` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `languages` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`library_item_id` text NOT NULL,
	`media_type` text NOT NULL,
	`title` text,
	`subtitle` text,
	`description` text,
	`language` text,
	`explicit` integer,
	`author` text,
	`publisher` text,
	`isbn` text,
	`asin` text,
	`published_year` text,
	`published_date` text,
	`duration` real,
	`track_count` integer,
	`format` text,
	`edition` text,
	`abridged` integer,
	`rating` real,
	`rating_count` integer,
	`goodreads_id` text,
	`google_books_id` text,
	`feed_url` text,
	`image_url` text,
	`itunes_page_url` text,
	`itunes_id` text,
	`itunes_artist_id` text,
	`type` text,
	`author_name` text,
	`author_name_lf` text,
	`narrator_name` text,
	`series_name` text,
	`added_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`library_item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `narrators` (
	`name` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`description` text,
	`added_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`name` text PRIMARY KEY NOT NULL
);
