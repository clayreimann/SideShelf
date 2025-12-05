import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'ABSPlayerEventBridge' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const ABSPlayerEventBridge = NativeModules.ABSPlayerEventBridge
  ? NativeModules.ABSPlayerEventBridge
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

const eventEmitter = new NativeEventEmitter(ABSPlayerEventBridge);

export interface NativePlayerEvent {
  type: string;
  payload?: any;
  __contextId?: string;
}

export const NativeBridge = {
  dispatch: (event: NativePlayerEvent) => {
    ABSPlayerEventBridge.dispatch(event);
  },
  
  addListener: (eventName: string, listener: (event: NativePlayerEvent) => void) => {
    return eventEmitter.addListener(eventName, listener);
  },
  
  removeAllListeners: (eventName: string) => {
    eventEmitter.removeAllListeners(eventName);
  }
};
