/**
 * Network slice for Zustand store
 *
 * This slice manages network connectivity state using NetInfo:
 * - Online/offline status
 * - Connection type (wifi, cellular, etc.)
 * - Server reachability
 */

import { apiClientService } from "@/services/ApiClientService";
import { logger } from "@/lib/logger";
import type { SliceCreator } from "@/types/store";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

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
    /** Whether we can reach the ABS server */
    serverReachable: boolean | null;
    /** Type of network connection (wifi, cellular, etc.) */
    connectionType: string | null;
    /** Whether the slice has been initialized */
    initialized: boolean;
    /** Last time server reachability was checked */
    lastServerCheck: number | null;
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
  /** Manually refresh network status (useful when NetInfo events don't fire) */
  refreshNetworkStatus: () => Promise<void>;
  /** Check if ABS server is reachable */
  checkServerReachability: () => Promise<void>;
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
    serverReachable: null,
    connectionType: null,
    initialized: false,
    lastServerCheck: null,
  },
};

// Server check interval (every 30 seconds when online)
const SERVER_CHECK_INTERVAL = 30000;
// Network status refresh interval (every 10 seconds to compensate for iOS simulator issues)
const NETWORK_STATUS_REFRESH_INTERVAL = 10000;

/**
 * Create the Network slice
 */
export const createNetworkSlice: SliceCreator<NetworkSlice> = (set, get: () => NetworkSlice) => {
  let serverCheckInterval: ReturnType<typeof setInterval> | null = null;
  let networkRefreshInterval: ReturnType<typeof setInterval> | null = null;

  return {
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
      log.info("Setting up NetInfo event listener");
      const unsubscribe = NetInfo.addEventListener((netState) => {
        log.debug("NetInfo event received");
        get()._updateNetworkState(netState);
      });

      // Fetch initial network state
      log.info("Fetching initial network state");
      NetInfo.fetch()
        .then((netState) => {
          log.info("Initial network state fetched successfully");
          get()._updateNetworkState(netState);
        })
        .catch((error) => {
          log.error("Failed to fetch initial network state", error);
        });

      // Start periodic server reachability checks
      serverCheckInterval = setInterval(() => {
        const currentState = get();
        if (currentState.network.isConnected && currentState.network.isInternetReachable) {
          get()
            .checkServerReachability()
            .catch((error) => {
              log.warn(`Server reachability check failed: ${error}`);
            });
        }
      }, SERVER_CHECK_INTERVAL);

      // Start periodic network status refresh (workaround for iOS simulator NetInfo issues)
      networkRefreshInterval = setInterval(() => {
        log.debug("Periodic network status refresh");
        get()
          .refreshNetworkStatus()
          .catch((error) => {
            log.warn(`Network status refresh failed: ${error}`);
          });
      }, NETWORK_STATUS_REFRESH_INTERVAL);

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
      log.debug(`_updateNetworkState called netState=${netState}`);

      const isConnected = netState.isConnected ?? false;
      const isInternetReachable = netState.isInternetReachable;
      const connectionType = netState.type;

      log.info(
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

      // Check server reachability when network becomes available
      if (isConnected && isInternetReachable) {
        log.info("Network available, checking server reachability");
        get()
          .checkServerReachability()
          .catch((error) => {
            log.warn(`Server reachability check failed after network change: ${error}`);
          });
      } else {
        // Mark server as unreachable when no network
        log.info("Network unavailable, marking server as unreachable");
        set((state: NetworkSlice) => ({
          ...state,
          network: {
            ...state.network,
            serverReachable: false,
          },
        }));
      }
    },

    /**
     * Manually refresh network status by fetching current state from NetInfo
     */
    refreshNetworkStatus: async () => {
      try {
        log.debug("Refreshing network status manually");
        const netState = await NetInfo.fetch();
        log.debug(`Manual network fetch completed netState=${netState}`);
        get()._updateNetworkState(netState);
      } catch (error) {
        log.error("Failed to refresh network status", error as Error);
      }
    },

    /**
     * Check if ABS server is reachable
     */
    checkServerReachability: async () => {
      const baseUrl = apiClientService.getBaseUrl();

      if (!baseUrl) {
        log.debug("No API base URL configured, skipping server check");
        return;
      }

      try {
        // Try to ping the server with a minimal request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(`${baseUrl}/ping`, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const isReachable = response.ok;
        log.debug(`Server reachability check: ${isReachable ? "reachable" : "unreachable"}`);

        set((state: NetworkSlice) => ({
          ...state,
          network: {
            ...state.network,
            serverReachable: isReachable,
            lastServerCheck: Date.now(),
          },
        }));
      } catch (error) {
        log.warn(`Server reachability check failed: ${error}`);
        set((state: NetworkSlice) => ({
          ...state,
          network: {
            ...state.network,
            serverReachable: false,
            lastServerCheck: Date.now(),
          },
        }));
      }
    },

    /**
     * Reset the slice to initial state
     */
    resetNetwork: () => {
      log.info("Resetting network slice");
      if (serverCheckInterval) {
        clearInterval(serverCheckInterval);
        serverCheckInterval = null;
      }
      if (networkRefreshInterval) {
        clearInterval(networkRefreshInterval);
        networkRefreshInterval = null;
      }
      set((state: NetworkSlice) => ({
        ...state,
        network: initialState.network,
      }));
    },
  };
};
