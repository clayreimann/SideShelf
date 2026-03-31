UPDATE local_audio_file_downloads
SET download_path = SUBSTR(download_path, 8)
WHERE download_path LIKE 'file://%';

UPDATE local_library_file_downloads
SET download_path = SUBSTR(download_path, 8)
WHERE download_path LIKE 'file://%';

UPDATE local_cover_cache
SET local_cover_url = SUBSTR(local_cover_url, 8)
WHERE local_cover_url LIKE 'file://%';

UPDATE local_audio_file_downloads
SET download_path = REPLACE(REPLACE(REPLACE(download_path, '%20', ' '), '%28', '('), '%29', ')')
WHERE download_path LIKE '%\%%' ESCAPE '\';

UPDATE local_library_file_downloads
SET download_path = REPLACE(REPLACE(REPLACE(download_path, '%20', ' '), '%28', '('), '%29', ')')
WHERE download_path LIKE '%\%%' ESCAPE '\';

UPDATE local_cover_cache
SET local_cover_url = REPLACE(REPLACE(REPLACE(local_cover_url, '%20', ' '), '%28', '('), '%29', ')')
WHERE local_cover_url LIKE '%\%%' ESCAPE '\'
