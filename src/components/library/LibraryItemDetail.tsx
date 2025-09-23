import { useThemedStyles } from '@/lib/theme';
import { Text, View } from 'react-native';

import { CollapsibleSection } from '@/components/ui';
import { AudioFileRow, getAudioFilesForMedia } from '@/db/helpers/audioFiles';
import { ChapterRow, getChaptersForMedia } from '@/db/helpers/chapters';
import { processFullLibraryItems } from '@/db/helpers/fullLibraryItems';
import { getLibraryItemById, NewLibraryItemRow } from '@/db/helpers/libraryItems';
import { getMediaGenres, getMediaTags } from '@/db/helpers/mediaJoins';
import { cacheCoverAndUpdateMetadata, getMediaMetadataByLibraryItemId } from '@/db/helpers/mediaMetadata';
import { getMediaProgressForLibraryItem, MediaProgressRow } from '@/db/helpers/mediaProgress';
import { getUserByUsername } from '@/db/helpers/users';
import { MediaMetadataRow } from '@/db/schema/mediaMetadata';
import { fetchLibraryItemsBatch } from '@/lib/api/endpoints';
import { getCoverUri } from '@/lib/covers';
import { useAuth } from '@/providers/AuthProvider';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';

interface LibraryItemDetailProps {
  itemId: string;
  onTitleChange?: (title: string) => void;
}

// Helper function to format time in seconds to HH:MM:SS
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

export default function LibraryItemDetail({ itemId, onTitleChange }: LibraryItemDetailProps) {
  const { styles, isDark } = useThemedStyles();
  const { width } = useWindowDimensions();
  const { username } = useAuth();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<NewLibraryItemRow | null>(null);
  const [metadata, setMetadata] = useState<MediaMetadataRow | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [progress, setProgress] = useState<MediaProgressRow | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFileRow[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      try {
        const itemRow = await getLibraryItemById(itemId);
        const meta = itemRow ? await getMediaMetadataByLibraryItemId(itemRow.id) : null;
        const genres = meta ? await getMediaGenres(meta.id) : [];
        const tags = meta ? await getMediaTags(meta.id) : [];

        // Get progress if user is authenticated
        let progressData = null;
        if (username && itemRow) {
          const user = await getUserByUsername(username);
          if (user?.id) {
            progressData = await getMediaProgressForLibraryItem(itemRow.id, user.id);
          }
        }

        // Get chapters and audio files if metadata exists
        const chaptersData = meta ? await getChaptersForMedia(meta.id) : [];
        const audioFilesData = meta ? await getAudioFilesForMedia(meta.id) : [];

        if (isMounted) {
          setItem(itemRow);
          setMetadata(meta);
          setGenres(genres);
          setTags(tags);
          setProgress(progressData);
          setChapters(chaptersData);
          setAudioFiles(audioFilesData);

          // Notify parent of title change for header
          const title = meta?.title || 'Unknown Title';
          onTitleChange?.(title);

          // Cache cover in background if item exists
          if (itemRow) {
            cacheCoverAndUpdateMetadata(itemRow.id).then(wasDownloaded => {
              if (wasDownloaded) {
                console.log('Cover was downloaded for item detail, refreshing metadata');
                // Refresh metadata to show the new cover
                getMediaMetadataByLibraryItemId(itemRow.id).then(updatedMeta => {
                  if (isMounted && updatedMeta) {
                    setMetadata(updatedMeta);
                  }
                });
              }
            }).catch(error => {
              console.error('Failed to cache cover for item detail:', error);
            });

            // Fetch full item data in background to ensure all relations are populated
            fetchLibraryItemsBatch([itemRow.id]).then(libraryItems => {
              if (libraryItems.length > 0) {
                console.log('[LibraryItemDetail] Fetched full item data, processing...');
                processFullLibraryItems(libraryItems).then(() => {
                  console.log('[LibraryItemDetail] Full item data processed');
                  // Refresh the data after processing
                  if (isMounted) {
                    // Re-fetch chapters and audio files as they might have been updated
                    if (meta) {
                      Promise.all([
                        getChaptersForMedia(meta.id),
                        getAudioFilesForMedia(meta.id)
                      ]).then(([newChapters, newAudioFiles]) => {
                        if (isMounted) {
                          setChapters(newChapters);
                          setAudioFiles(newAudioFiles);
                        }
                      });
                    }
                  }
                }).catch(error => {
                  console.error('[LibraryItemDetail] Error processing full item data:', error);
                });
              }
            }).catch(error => {
              console.error('[LibraryItemDetail] Error fetching full item data:', error);
            });
          }
        }
      } catch (e) {
        console.error('[LibraryItemDetail] Error fetching item data:', e);
        if (isMounted) {
          setItem(null);
          setMetadata(null);
          setGenres([]);
          setTags([]);
          setProgress(null);
          setChapters([]);
          setAudioFiles([]);
          onTitleChange?.('Item not found');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    if (itemId) fetchData();
    return () => { isMounted = false; };
  }, [itemId, username, onTitleChange]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Item not found.</Text>
      </View>
    );
  }

  // Prefer metadata fields, fallback to item fields
  const title = metadata?.title || 'Unknown Title';
  const coverUri = metadata?.imageUrl || (item ? getCoverUri(item.id) : null);
  const description = metadata?.description || '';
  const author = metadata?.authorName || metadata?.author || 'Unknown Author';
  const narrator = metadata?.narratorName || null;
  const series = metadata?.seriesName || null;
  const imageSize = width * 0.8;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: styles.container.backgroundColor, marginBottom: 100 }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={{
              width: imageSize,
              height: imageSize,
              borderRadius: 8,
              backgroundColor: isDark ? '#222' : '#eee'
            }}
            resizeMode="contain"
          />
        ) : (
          <View style={{
            width: imageSize,
            height: imageSize,
            borderRadius: 8,
            backgroundColor: isDark ? '#222' : '#eee',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Text style={{
              color: isDark ? '#bbb' : '#444',
              fontSize: 14,
              textAlign: 'center',
              paddingHorizontal: 12
            }} numberOfLines={3}>
              {title || 'No Cover'}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.text, { fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }]}>
        {title}
      </Text>
      {series ? (
        <Text style={[styles.text, { fontStyle: 'italic', marginBottom: 4, textAlign: 'center' }]}>
          Series: {series}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
        <Text style={[styles.text, { marginRight: 8 }]}>Author: {author}</Text>
        {narrator ? <Text style={styles.text}>Narrator: {narrator}</Text> : null}
      </View>

      {/* Progress display */}
      {progress && (
        <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
          <View style={{
            backgroundColor: isDark ? '#333' : '#f5f5f5',
            borderRadius: 8,
            padding: 12
          }}>
            <Text style={[styles.text, { fontSize: 14, marginBottom: 8, textAlign: 'center' }]}>
              Progress: {Math.round((progress.progress || 0) * 100)}%
            </Text>
            <View style={{
              height: 4,
              backgroundColor: isDark ? '#555' : '#ddd',
              borderRadius: 2,
              overflow: 'hidden'
            }}>
              <View style={{
                height: '100%',
                width: `${Math.round((progress.progress || 0) * 100)}%`,
                backgroundColor: '#007AFF',
                borderRadius: 2,
              }} />
            </View>
            {progress.currentTime && progress.duration && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                  {formatTime(progress.currentTime)}
                </Text>
                <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                  {formatTime(progress.duration)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
      {genres && genres.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8, justifyContent: 'center' }}>
          {genres.map((g: string, idx: number) => (
            <View key={g + idx} style={{ backgroundColor: isDark ? '#333' : '#eee', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, margin: 2 }}>
              <Text style={{ fontSize: 12, color: isDark ? '#ccc' : '#333' }}>{g}</Text>
            </View>
          ))}
        </View>
      )}
      {tags && tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8, justifyContent: 'center' }}>
          {tags.map((t: string, idx: number) => (
            <View key={t + idx} style={{ backgroundColor: isDark ? '#1a4f6e' : '#d0eaff', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, margin: 2 }}>
              <Text style={{ fontSize: 12, color: isDark ? '#ccc' : '#333' }}>{t}</Text>
            </View>
          ))}
        </View>
      )}
      {/* Collapsible Description */}
      {description && (
        <CollapsibleSection title="Description" defaultExpanded={true}>
          <RenderHtml
            contentWidth={width - 64}
            source={{ html: description }}
            baseStyle={{ color: styles.text.color, fontSize: 16 }}
          />
        </CollapsibleSection>
      )}

      {/* Collapsible Chapters */}
      {chapters.length > 0 && (
        <CollapsibleSection title={`Chapters (${chapters.length})`}>
          {chapters.map((chapter, index) => (
            <View key={chapter.id} style={{
              paddingVertical: 8,
              borderBottomWidth: index < chapters.length - 1 ? 1 : 0,
              borderBottomColor: isDark ? '#444' : '#eee'
            }}>
              <Text style={[styles.text, { fontWeight: '600', marginBottom: 2 }]}>
                Chapter {chapter.chapterId}: {chapter.title}
              </Text>
              <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                {formatTime(chapter.start)} - {formatTime(chapter.end)}
              </Text>
            </View>
          ))}
        </CollapsibleSection>
      )}

      {/* Collapsible Audio Files */}
      {audioFiles.length > 0 && (
        <CollapsibleSection title={`Audio Files (${audioFiles.length})`}>
          {audioFiles.map((file, index) => (
            <View key={file.id} style={{
              paddingVertical: 8,
              borderBottomWidth: index < audioFiles.length - 1 ? 1 : 0,
              borderBottomColor: isDark ? '#444' : '#eee'
            }}>
              <Text style={[styles.text, { fontWeight: '600', marginBottom: 2 }]} numberOfLines={1}>
                {file.filename}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                  Duration: {file.duration ? formatTime(file.duration) : 'Unknown'}
                </Text>
                {file.size && (
                  <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                    Size: {(file.size / 1024 / 1024).toFixed(1)} MB
                  </Text>
                )}
                {file.format && (
                  <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                    Format: {file.format}
                  </Text>
                )}
                {file.isDownloaded && (
                  <Text style={[styles.text, { fontSize: 12, color: '#007AFF' }]}>
                    ⬇ Downloaded
                  </Text>
                )}
              </View>
            </View>
          ))}
        </CollapsibleSection>
      )}
    </ScrollView>
  );
}
