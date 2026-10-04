CREATE TABLE `progress_sync_outbox` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`desired_revision` integer DEFAULT 1 NOT NULL,
	`acknowledged_revision` integer DEFAULT 0 NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`next_attempt_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`terminal_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `local_listening_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `progress_sync_outbox_user_retry_idx` ON `progress_sync_outbox` (`user_id`,`next_attempt_at`);
--> statement-breakpoint
INSERT INTO `progress_sync_outbox` (
  `session_id`, `user_id`, `desired_revision`, `acknowledged_revision`,
  `attempt_count`, `created_at`, `updated_at`
)
SELECT
  `id`, `user_id`, 1,
  CASE
    WHEN `is_synced` = 1
      AND `last_sync_time` IS NOT NULL
      AND `updated_at` <= `last_sync_time`
    THEN 1 ELSE 0
  END,
  0, `created_at`, `updated_at`
FROM `local_listening_sessions`;
--> statement-breakpoint
UPDATE local_audio_file_downloads
SET download_path = SUBSTR(download_path, 8)
WHERE download_path LIKE 'file://%';
--> statement-breakpoint
UPDATE local_library_file_downloads
SET download_path = SUBSTR(download_path, 8)
WHERE download_path LIKE 'file://%';
--> statement-breakpoint
UPDATE local_cover_cache
SET local_cover_url = SUBSTR(local_cover_url, 8)
WHERE local_cover_url LIKE 'file://%';
--> statement-breakpoint
UPDATE local_audio_file_downloads
SET download_path = REPLACE(REPLACE(REPLACE(download_path, '%20', ' '), '%28', '('), '%29', ')')
WHERE download_path LIKE '%\%%' ESCAPE '\';
--> statement-breakpoint
UPDATE local_library_file_downloads
SET download_path = REPLACE(REPLACE(REPLACE(download_path, '%20', ' '), '%28', '('), '%29', ')')
WHERE download_path LIKE '%\%%' ESCAPE '\';
--> statement-breakpoint
UPDATE local_cover_cache
SET local_cover_url = REPLACE(REPLACE(REPLACE(local_cover_url, '%20', ' '), '%28', '('), '%29', ')')
WHERE local_cover_url LIKE '%\%%' ESCAPE '\';
