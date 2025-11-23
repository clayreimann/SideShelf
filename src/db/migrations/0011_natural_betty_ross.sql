ALTER TABLE `local_audio_file_downloads` ADD `storage_location` text DEFAULT 'caches' NOT NULL;--> statement-breakpoint
ALTER TABLE `local_audio_file_downloads` ADD `last_accessed_at` integer;--> statement-breakpoint
ALTER TABLE `local_audio_file_downloads` ADD `moved_to_cache_at` integer;