DROP INDEX `media_series_pk`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_series_pk` ON `media_series` (`media_id`,`series_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_authors_pk` ON `media_authors` (`media_id`,`author_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_genres_pk` ON `media_genres` (`media_id`,`genre_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_narrators_pk` ON `media_narrators` (`media_id`,`narrator_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_tags_pk` ON `media_tags` (`media_id`,`tag_name`);