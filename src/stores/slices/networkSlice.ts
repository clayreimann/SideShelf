/**
 * Network slice for Zustand store
 *
 * This slice manages network connectivity state using NetInfo:
 * - Online/offline status
 * - Connection type (wifi, cellular, etc.)
 * - Server reachability
 */

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { logger } from "@/lib/logger";
import type { SliceCreator } from "@/types/store";

// Create cached sublogger for this slice
const log = logger.forTag("NetworkSlice");

/**
 * Network slice state interface - scoped under 'network'
 */
export interface NetworkSliceState {
  network: {
    /** Whether the device is connected to a network */
    isConnected: boolean;
    /** Whether the device can reach the internet */
    isInternetReachable: boolean | null;
    /** Type of network connection (wifi, cellular, etc.) */
    connectionType: string | null;
    /** Whether the slice has been initialized */
    initialized: boolean;
  };
}

/**
 * Network slice actions interface
 */
export interface NetworkSliceActions {
  /** Initialize the slice and start listening to network changes */
  initializeNetwork: () => void;
  /** Update network state (called by NetInfo listener) */
  _updateNetworkState: (state: NetInfoState) => void;
  /** Reset the slice to initial state */
  resetNetwork: () => void;
}

/**
 * Combined Network slice interface
 */
export interface NetworkSlice extends NetworkSliceState, NetworkSliceActions {}

/**
 * Initial state
 */
const initialState: NetworkSliceState = {
  network: {
    isConnected: false,
    isInternetReachable: null,
    connectionType: null,
    initialized: false,
  },
};

/**
 * Create the Network slice
 */
export const createNetworkSlice: SliceCreator<NetworkSlice> = (set, get) => ({
  // Initial state
  ...initialState,

  /**
   * Initialize the slice and start listening to network changes
   */
  initializeNetwork: () => {
    const state = get();

    if (state.network.initialized) {
      log.debug("Network already initialized, skipping");
      return;
    }

    log.info("Initializing network slice...");

    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((netState) => {
      get()._updateNetworkState(netState);
    });

    // Fetch initial network state
    NetInfo.fetch().then((netState) => {
      get()._updateNetworkState(netState);
    });

    set((state: NetworkSlice) => ({
      ...state,
      network: {
        ...state.network,
        initialized: true,
      },
    }));

    log.info("Network slice initialized successfully");

    // Note: We don't call unsubscribe because we want to listen for the app lifetime
    // In a production app, you might want to store the unsubscribe function
    // and call it when the app is destroyed
  },

  /**
   * Update network state (called by NetInfo listener)
   */
  _updateNetworkState: (netState: NetInfoState) => {
    const isConnected = netState.isConnected ?? false;
    const isInternetReachable = netState.isInternetReachable;
    const connectionType = netState.type;

    log.debug(
      `Network state updated: connected=${isConnected}, reachable=${isInternetReachable}, type=${connectionType}`
    );

    set((state: NetworkSlice) => ({
      ...state,
      network: {
        ...state.network,
        isConnected,
        isInternetReachable,
        connectionType,
      },
    }));
  },

  /**
   * Reset the slice to initial state
   */
  resetNetwork: () => {
    log.info("Resetting network slice");
    set((state: NetworkSlice) => ({
      ...state,
      network: initialState.network,
    }));
  },
});
