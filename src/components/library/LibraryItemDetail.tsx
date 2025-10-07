import { useThemedStyles } from '@/lib/theme';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { CollapsibleSection, ProgressBar } from '@/components/ui';
import { ChapterRow, getChaptersForMedia } from '@/db/helpers/chapters';
import { AudioFileWithDownloadInfo, getAudioFilesWithDownloadInfo } from '@/db/helpers/combinedQueries';
import { processFullLibraryItems } from '@/db/helpers/fullLibraryItems';
import { getLibraryItemById, NewLibraryItemRow } from '@/db/helpers/libraryItems';
import { getMediaGenres, getMediaTags } from '@/db/helpers/mediaJoins';
import { cacheCoverAndUpdateMetadata, getMediaMetadataByLibraryItemId } from '@/db/helpers/mediaMetadata';
import { getMediaProgressForLibraryItem, MediaProgressRow } from '@/db/helpers/mediaProgress';
import { getUserByUsername } from '@/db/helpers/users';
import { MediaMetadataRow } from '@/db/schema/mediaMetadata';
import { fetchLibraryItemsBatch } from '@/lib/api/endpoints';
import { getCoverUri } from '@/lib/covers';
import { formatBytes, formatSpeed, formatTimeRemaining } from '@/lib/helpers/formatters';
import { useAuth } from '@/providers/AuthProvider';
import { DownloadProgress, downloadService } from '@/services/DownloadService';
import { playerService } from '@/services/PlayerService';
import { unifiedProgressService } from '@/services/UnifiedProgressService';
import { useAppStore } from '@/stores/appStore';
import type { PlayerTrack } from '@/types/player';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Octicons from '@expo/vector-icons/Octicons';
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

function Separator() {
  const { isDark } = useThemedStyles();
  return <View style={{ marginHorizontal: 12 }}>
    <Text style={{ color: isDark ? '#bbb' : '#444', fontSize: 24, textAlign: 'center' }}>•</Text>
  </View>;
}

// Memoized RenderHtml component to prevent frequent re-renders of TRenderEngineProvider
const MemoizedRenderHtml = React.memo(({ contentWidth, description, textColor }: {
  contentWidth: number;
  description: string;
  textColor: string;
}) => {
  const htmlSource = useMemo(() => ({ html: description }), [description]);
  const baseStyle = useMemo(() => ({ color: textColor, fontSize: 16 }), [textColor]);
  const tagsStyles = useMemo(() => ({
    p: { marginBottom: 12, lineHeight: 24 },
    div: { marginBottom: 8 },
    br: { marginBottom: 8 },
    b: { fontWeight: 'bold' },
    strong: { fontWeight: 'bold' },
    i: { fontStyle: 'italic' }
  }), []);

  return (
    <RenderHtml
      contentWidth={contentWidth}
      source={htmlSource}
      baseStyle={baseStyle}
      tagsStyles={tagsStyles}
    />
  );
});

export default function LibraryItemDetail({ itemId, onTitleChange }: LibraryItemDetailProps) {
  const { styles, isDark } = useThemedStyles();
  const { width } = useWindowDimensions();
  const { username, serverUrl, accessToken } = useAuth();

  // Player store
  const { playTrack, player } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<NewLibraryItemRow | null>(null);
  const [metadata, setMetadata] = useState<MediaMetadataRow | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [progress, setProgress] = useState<MediaProgressRow | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFileWithDownloadInfo[]>([]);

  // Download states
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Main data fetching effect
  useEffect(() => {
    let isMounted = true;

    const fetchBasicData = async () => {
      setLoading(true);
      try {
        const itemRow = await getLibraryItemById(itemId);
        const meta = itemRow ? await getMediaMetadataByLibraryItemId(itemRow.id) : null;
        const genres = meta ? await getMediaGenres(meta.id) : [];
        const tags = meta ? await getMediaTags(meta.id) : [];

        // Get chapters and audio files if metadata exists
        const chaptersData = meta ? await getChaptersForMedia(meta.id) : [];
        const audioFilesData = meta ? await getAudioFilesWithDownloadInfo(meta.id) : [];

        // Ensure DownloadService is initialized before checking status
        await downloadService.initialize();

        // Check download status
        const downloadedStatus = itemRow ? await downloadService.isLibraryItemDownloaded(itemRow.id) : false;
        const isActiveDownload = itemRow ? downloadService.isDownloadActive(itemRow.id) : false;

        if (isMounted) {
          setItem(itemRow);
          setMetadata(meta);
          setGenres(genres);
          setTags(tags);
          setChapters(chaptersData);
          setAudioFiles(audioFilesData);
          setIsDownloaded(downloadedStatus);
          setIsDownloading(isActiveDownload);

          // Notify parent of title change for header
          const title = meta?.title || 'Unknown Title';
          onTitleChange?.(title);
        }
      } catch (e) {
        console.error('[LibraryItemDetail] Error fetching item data:', e);
        if (isMounted) {
          setItem(null);
          setMetadata(null);
          setGenres([]);
          setTags([]);
          setChapters([]);
          setAudioFiles([]);
          onTitleChange?.('Item not found');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (itemId) fetchBasicData();
    return () => { isMounted = false; };
  }, [itemId, onTitleChange]);

  // ApiUser progress fetching effect
  useEffect(() => {
    let isMounted = true;

    const fetchUserProgress = async () => {
      if (!username || !item) return;

      try {
        // Fetch latest progress from server
        await unifiedProgressService.fetchServerProgress();

        // Get the local progress data
        const user = await getUserByUsername(username);
        if (user?.id) {
          const progressData = await getMediaProgressForLibraryItem(item.id, user.id);
          if (isMounted) {
            setProgress(progressData);
          }
        }
      } catch (error) {
        console.error('[LibraryItemDetail] Error fetching user progress:', error);
      }
    };

    fetchUserProgress();
    return () => { isMounted = false; };
  }, [username, item?.id]);

  // Background data enhancement effect
  useEffect(() => {
    let isMounted = true;

    const enhanceData = async () => {
      if (!item) return;

      try {
        // Cache cover in background
        const wasDownloaded = await cacheCoverAndUpdateMetadata(item.id);
        if (wasDownloaded && isMounted) {
          console.log('Cover was downloaded for item detail, refreshing metadata');
          const updatedMeta = await getMediaMetadataByLibraryItemId(item.id);
          if (isMounted && updatedMeta) {
            setMetadata(updatedMeta);
          }
        }
      } catch (error) {
        console.error('Failed to cache cover for item detail:', error);
      }

      try {
        // Fetch full item data in background to ensure all relations are populated
        const libraryItems = await fetchLibraryItemsBatch([item.id]);
        if (libraryItems.length > 0 && isMounted) {
          console.log('[LibraryItemDetail] Fetched full item data, processing...');
          await processFullLibraryItems(libraryItems);
          console.log('[LibraryItemDetail] Full item data processed');

          // Refresh the data after processing
          if (metadata && isMounted) {
            const [newChapters, newAudioFiles] = await Promise.all([
              getChaptersForMedia(metadata.id),
              getAudioFilesWithDownloadInfo(metadata.id)
            ]);

            if (isMounted) {
              setChapters(newChapters);
              setAudioFiles(newAudioFiles);
            }
          }
        }
      } catch (error) {
        console.error('[LibraryItemDetail] Error enhancing data:', error);
      }
    };

    enhanceData();
    return () => { isMounted = false; };
  }, [item?.id, metadata?.id]);

  // Manage download progress subscription
  useEffect(() => {
    if (!item) return;

    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    const setupSubscription = async () => {
      try {
        // Ensure service is initialized before subscribing
        await downloadService.initialize();

        if (!isMounted) return; // Component unmounted during initialization

        // Subscribe to progress updates
        unsubscribe = downloadService.subscribeToProgress(item.id, (progress) => {
          console.log('[LibraryItemDetail] Progress update received:', progress);
          setDownloadProgress(progress);

          // Update download state based on progress
          if (progress.status === 'completed') {
            setIsDownloading(false);
            setIsDownloaded(true);
            setDownloadProgress(null);
          } else if (progress.status === 'error' || progress.status === 'cancelled') {
            setIsDownloading(false);
            setDownloadProgress(null);
          } else {
            setIsDownloading(true);
          }
        });

        // Check if download is currently active
        const isActive = downloadService.isDownloadActive(item.id);
        if (isMounted) {
          setIsDownloading(isActive);

          // If there's an active download, get current progress
          if (isActive) {
            const currentProgress = downloadService.getCurrentProgress(item.id);
            if (currentProgress) {
              setDownloadProgress(currentProgress);
            }
          }
        }
      } catch (error) {
        console.error('[LibraryItemDetail] Error setting up download subscription:', error);
      }
    };

    setupSubscription();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [item?.id]);

  // Download handlers
  const handleDownload = useCallback(async () => {
    if (!item || !serverUrl || !accessToken || isDownloading) return;

    try {
      // Check if download is already active before attempting to start
      await downloadService.initialize();
      if (downloadService.isDownloadActive(item.id)) {
        console.log('[LibraryItemDetail] Download already active, subscribing to progress');
        setIsDownloading(true);
        const currentProgress = downloadService.getCurrentProgress(item.id);
        if (currentProgress) {
          setDownloadProgress(currentProgress);
        }
        return;
      }

      // Set downloading state immediately to show UI feedback
      setIsDownloading(true);

      // Start download with a callback to ensure immediate progress updates
      await downloadService.startDownload(item.id, serverUrl, accessToken, (progress) => {
        console.log('[LibraryItemDetail] Direct progress callback:', progress);
        setDownloadProgress(progress);

        // Update download state based on progress
        if (progress.status === 'completed') {
          setIsDownloading(false);
          setIsDownloaded(true);
          setDownloadProgress(null);
        } else if (progress.status === 'error' || progress.status === 'cancelled') {
          setIsDownloading(false);
          setDownloadProgress(null);
        } else {
          setIsDownloading(true);
        }
      });

      // The progress subscription will handle state updates
      // Refresh audio files to show download status when completed
      if (metadata) {
        const updatedAudioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
        setAudioFiles(updatedAudioFiles);
      }
    } catch (error) {
      console.error('[LibraryItemDetail] Download failed:', error);

      // Handle the specific case where download is already in progress
      if (error instanceof Error && error.message.includes('Download already in progress')) {
        console.log('[LibraryItemDetail] Download already in progress, updating UI state');
        setIsDownloading(true);
        const currentProgress = downloadService.getCurrentProgress(item.id);
        if (currentProgress) {
          setDownloadProgress(currentProgress);
        }
      } else {
        Alert.alert(
          'Download Failed',
          `Failed to download library item: ${error}`,
          [{ text: 'OK' }]
        );
        setIsDownloading(false);
      }
    }
  }, [item, serverUrl, accessToken, isDownloading, metadata]);

  const handleDeleteDownload = useCallback(async () => {
    if (!item) return;

    Alert.alert(
      'Delete Download',
      'Are you sure you want to delete the downloaded files? This will free up storage space.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadService.deleteDownloadedLibraryItem(item.id);
              setIsDownloaded(false);

              // Refresh audio files to show download status
              if (metadata) {
                const updatedAudioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
                setAudioFiles(updatedAudioFiles);
              }
            } catch (error) {
              console.error('[LibraryItemDetail] Delete download failed:', error);
              Alert.alert(
                'Delete Failed',
                `Failed to delete downloaded files: ${error}`,
                [{ text: 'OK' }]
              );
            }
          }
        }
      ]
    );
  }, [item, metadata]);

  const handleCancelDownload = useCallback(() => {
    if (!item) return;

    downloadService.cancelDownload(item.id);
    // State will be updated via progress subscription
  }, [item]);

  const handlePauseDownload = useCallback(() => {
    if (!item) return;

    downloadService.pauseDownload(item.id);
    // State will be updated via progress subscription
  }, [item]);

  const handleResumeDownload = useCallback(() => {
    if (!item) return;

    downloadService.resumeDownload(item.id);
    // State will be updated via progress subscription
  }, [item]);

  // Play handler
  const handlePlay = useCallback(async () => {
    if (!item || !metadata || !audioFiles.length) {
      Alert.alert('Cannot Play', 'No audio files available for this item.');
      return;
    }

    try {
      // Build player track
      const playerTrack: PlayerTrack = {
        libraryItemId: item.id,
        mediaId: metadata.id,
        title: metadata.title || 'Unknown Title',
        author: metadata.authorName || metadata.author || 'Unknown Author',
        coverUri: metadata.imageUrl || getCoverUri(item.id),
        audioFiles,
        chapters,
        duration: audioFiles.reduce((total, file) => total + (file.duration || 0), 0),
        isDownloaded: audioFiles.some(file => file.downloadInfo?.isDownloaded),
      };

      // Play the track
      await playTrack(playerTrack);
      await playerService.playTrack(playerTrack, username || undefined);
    } catch (error) {
      console.error('[LibraryItemDetail] Failed to play track:', error);
      Alert.alert(
        'Playback Failed',
        `Failed to start playback: ${error}`,
        [{ text: 'OK' }]
      );
    }
  }, [item, metadata, audioFiles, chapters, playTrack]);

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
  const imageSize = width * 0.4;

  return <>
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
      <View style={{ flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <FontAwesome6 name="pen-to-square" size={16} color={isDark ? 'white' : 'black'} style={{ marginRight: 8 }} />
            <Text style={[styles.text, { textAlign: 'center' }]}>
              {author}
            </Text>
          </View>
          {narrator ? (
            <>
              <Separator />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome6 name="microphone-lines" size={16} color={isDark ? 'white' : 'black'} style={{ marginRight: 8 }} />
                <Text style={[styles.text, { textAlign: 'center' }]}>
                  {narrator}
                </Text>
              </View>
            </>
          ) : null}
        </View>
        {series ? (
          <Text style={[styles.text, { fontStyle: 'italic', marginBottom: 4, textAlign: 'center' }]}>
            <MaterialCommunityIcons name="bookshelf" size={24} color={isDark ? 'white' : 'black'} /> {series}
          </Text>
        ) : null}
      </View>



      {/* Progress display */}
      {progress && (
        <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
          <View style={{
            backgroundColor: isDark ? '#333' : '#f5f5f5',
            borderRadius: 8,
            padding: 12
          }}>
            <ProgressBar
              progress={progress.progress || 0}
              variant="medium"
              showTimeLabels={!!(progress.currentTime && progress.duration)}
              currentTime={progress.currentTime || undefined}
              duration={progress.duration || undefined}
              showPercentage={true}
            />
          </View>
        </View>
      )}

      {/* Download Section */}
      <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
        {isDownloading ? (
          <View style={{
            backgroundColor: isDark ? '#333' : '#f5f5f5',
            borderRadius: 8,
            padding: 12
          }}>
            <Text style={[styles.text, { fontSize: 14, marginBottom: 8, textAlign: 'center' }]}>
              {downloadProgress ? (
                downloadProgress.status === 'downloading'
                  ? `Downloading: ${downloadProgress.currentFile}`
                  : downloadProgress.status === 'completed'
                    ? 'Download Complete!'
                    : downloadProgress.status === 'cancelled'
                      ? 'Download Cancelled'
                      : 'Download Error'
              ) : (
                'Preparing download...'
              )}
            </Text>

            {/* Overall Progress Bar */}
            <View style={{ marginBottom: 8 }}>
              <ProgressBar
                progress={downloadProgress?.totalProgress || 0}
                variant="large"
                progressColor={downloadProgress?.status === 'error' ? '#FF3B30' : '#007AFF'}
                customPercentageText={`Overall Progress: ${Math.round((downloadProgress?.totalProgress || 0) * 100)}%`}
                showPercentage={true}
              />
            </View>

            {/* Current File Progress Bar */}
            {downloadProgress?.status === 'downloading' && downloadProgress?.currentFile && (
              <View style={{ marginBottom: 8 }}>
                <ProgressBar
                  progress={downloadProgress?.fileProgress || 0}
                  variant="medium"
                  progressColor="#34C759"
                  customPercentageText={`Current File: ${Math.round((downloadProgress?.fileProgress || 0) * 100)}%`}
                  showPercentage={true}
                />
              </View>
            )}

            {/* Download Stats */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { fontSize: 11, opacity: 0.7, textAlign: 'left' }]}>
                  Files: {downloadProgress?.downloadedFiles || 0}/{downloadProgress?.totalFiles || 0}
                </Text>
                <Text style={[styles.text, { fontSize: 11, opacity: 0.7, textAlign: 'left' }]}>
                  Size: {formatBytes(downloadProgress?.bytesDownloaded || 0)}/{formatBytes(downloadProgress?.totalBytes || 0)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { fontSize: 11, opacity: 0.7, textAlign: 'right' }]}>
                  Speed: {formatSpeed(downloadProgress?.downloadSpeed || 0)}
                </Text>
                {(downloadProgress?.downloadSpeed || 0) > 0 && (
                  <Text style={[styles.text, { fontSize: 11, opacity: 0.7, textAlign: 'right' }]}>
                    ETA: {formatTimeRemaining(
                      (downloadProgress?.totalBytes || 0) - (downloadProgress?.bytesDownloaded || 0),
                      downloadProgress?.downloadSpeed || 0,
                      3, // minSamplesForEta
                      downloadProgress?.speedSampleCount || 0
                    )}
                  </Text>
                )}
              </View>
            </View>

            {/* Download Control Buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}>
              {downloadProgress?.canPause && (
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FF9500',
                    borderRadius: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                  }}
                  onPress={handlePauseDownload}
                >
                  <Text style={{
                    color: 'white',
                    fontSize: 12,
                    fontWeight: '600'
                  }}>
                    ⏸️ Pause
                  </Text>
                </TouchableOpacity>
              )}

              {downloadProgress?.canResume && (
                <TouchableOpacity
                  style={{
                    backgroundColor: '#34C759',
                    borderRadius: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                  }}
                  onPress={handleResumeDownload}
                >
                  <Text style={{
                    color: 'white',
                    fontSize: 12,
                    fontWeight: '600'
                  }}>
                    ▶️ Resume
                  </Text>
                </TouchableOpacity>
              )}

              {(downloadProgress?.status === 'downloading' || downloadProgress?.status === 'paused') && (
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FF3B30',
                    borderRadius: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                  }}
                  onPress={handleCancelDownload}
                >
                  <Text style={{
                    color: 'white',
                    fontSize: 12,
                    fontWeight: '600'
                  }}>
                    ❌ Cancel
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}
      </View>

      {/* Play Button */}
      {audioFiles.length > 0 && (
        <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
          <TouchableOpacity
            style={{
              backgroundColor: '#34C759',
              borderRadius: 8,
              padding: 12,
              alignItems: 'center',
              opacity: player.loading.isLoadingTrack ? 0.5 : 1
            }}
            onPress={handlePlay}
            disabled={player.loading.isLoadingTrack}
          >
            <Text style={{
              color: 'white',
              fontSize: 16,
              fontWeight: '600'
            }}>
              {player.loading.isLoadingTrack ? '⏳ Loading...' : '▶️ Play'}
            </Text>
            {audioFiles.some(file => file.downloadInfo?.isDownloaded) && (
              <Text style={{
                color: 'white',
                fontSize: 12,
                opacity: 0.8,
                marginTop: 2
              }}>
                Downloaded files available
              </Text>
            )}
          </TouchableOpacity>
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
          <MemoizedRenderHtml
            contentWidth={width - 64}
            description={description}
            textColor={styles.text.color}
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
                {formatTime(chapter.start)} - {formatTime(chapter.end)} ({formatTime(chapter.end - chapter.start)})
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
                {file.downloadInfo?.isDownloaded && (
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
    <Stack.Screen options={{
      headerRight: () => (
        <TouchableOpacity onPress={isDownloaded ? handleDeleteDownload : handleDownload} disabled={!serverUrl || !accessToken || isDownloading}>
          <Octicons name={isDownloaded ? 'trash' : 'download'} size={24} color={isDark ? 'white' : 'black'} />
        </TouchableOpacity>
      )
    }} />
  </>
}
