CREATE INDEX `audio_files_media_id_idx` ON `audio_files` (`media_id`);--> statement-breakpoint
CREATE INDEX `library_items_library_id_idx` ON `library_items` (`library_id`);--> statement-breakpoint
CREATE INDEX `media_metadata_library_item_id_idx` ON `media_metadata` (`library_item_id`);--> statement-breakpoint
CREATE INDEX `media_progress_user_library_idx` ON `media_progress` (`user_id`,`library_item_id`);