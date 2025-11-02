import AsyncStorage from '@react-native-async-storage/async-storage';

export const ASYNC_KEYS = {
  currentTrack: 'abs.currentTrack',
  playbackRate: 'abs.playbackRate',
  volume: 'abs.volume',
  position: 'abs.position',
  isPlaying: 'abs.isPlaying',
  currentPlaySessionId: 'abs.currentPlaySessionId',
  username: 'abs.username',
};

export async function saveItem(key: string, value: any): Promise<void> {
  try {
    if (value === null || value === undefined) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.error(`[asyncStore] Failed to save item ${key}:`, error);
    throw error;
  }
}

export async function getItem(key: string): Promise<any> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error(`[asyncStore] Failed to get item ${key}:`, error);
    return null;
  }
}
