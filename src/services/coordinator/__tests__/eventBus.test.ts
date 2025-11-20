/**
 * Tests for PlayerEventBus
 *
 * Tests event dispatching, subscription, and history tracking
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PlayerEventBus, dispatchPlayerEvent, playerEventBus } from '../eventBus';
import type { PlayerEvent } from '@/types/coordinator';

describe('PlayerEventBus', () => {
  let bus: PlayerEventBus;

  beforeEach(() => {
    bus = new PlayerEventBus();
  });

  afterEach(() => {
    bus.clearListeners();
  });

  describe('dispatch', () => {
    it('should dispatch event to all listeners', () => {
      const listener1 = jest.fn<(event: PlayerEvent) => void>();
      const listener2 = jest.fn<(event: PlayerEvent) => void>();

      bus.subscribe(listener1);
      bus.subscribe(listener2);

      const event: PlayerEvent = { type: 'PLAY' };
      bus.dispatch(event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it('should dispatch events with payload', () => {
      const listener = jest.fn<(event: PlayerEvent) => void>();
      bus.subscribe(listener);

      const event: PlayerEvent = {
        type: 'LOAD_TRACK',
        payload: { libraryItemId: 'book-123', episodeId: 'ep-456' },
      };

      bus.dispatch(event);

      expect(listener).toHaveBeenCalledWith(event);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LOAD_TRACK',
          payload: {
            libraryItemId: 'book-123',
            episodeId: 'ep-456',
          },
        })
      );
    });

    it('should handle async listeners without blocking', async () => {
      const asyncListener = jest.fn<(event: PlayerEvent) => Promise<void>>(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      bus.subscribe(asyncListener);

      const event: PlayerEvent = { type: 'PLAY' };
      bus.dispatch(event); // Don't await

      // Dispatch should not block
      expect(asyncListener).toHaveBeenCalledWith(event);
    });

    it('should not throw if listener throws error', () => {
      const errorListener = jest.fn<(event: PlayerEvent) => void>(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn<(event: PlayerEvent) => void>();

      bus.subscribe(errorListener);
      bus.subscribe(goodListener);

      const event: PlayerEvent = { type: 'PLAY' };

      // Should not throw
      expect(() => bus.dispatch(event)).not.toThrow();

      // Error listener should have been called
      expect(errorListener).toHaveBeenCalledWith(event);
      // Good listener should still be called
      expect(goodListener).toHaveBeenCalledWith(event);
    });

    it('should add event to history', () => {
      const event: PlayerEvent = { type: 'PLAY' };
      bus.dispatch(event);

      const history = bus.getEventHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        event,
        timestamp: expect.any(Number),
      });
    });

    it('should maintain event history up to limit', () => {
      // Dispatch 150 events (max is 100)
      for (let i = 0; i < 150; i++) {
        bus.dispatch({ type: 'PLAY' });
      }

      const history = bus.getEventHistory();

      // Should only keep last 100
      expect(history).toHaveLength(100);
    });

    it('should preserve event order in history', () => {
      const events: PlayerEvent[] = [
        { type: 'LOAD_TRACK', payload: { libraryItemId: '1' } },
        { type: 'PLAY' },
        { type: 'PAUSE' },
        { type: 'STOP' },
      ];

      events.forEach((event) => bus.dispatch(event));

      const history = bus.getEventHistory();

      expect(history).toHaveLength(4);
      expect(history[0].event.type).toBe('LOAD_TRACK');
      expect(history[1].event.type).toBe('PLAY');
      expect(history[2].event.type).toBe('PAUSE');
      expect(history[3].event.type).toBe('STOP');
    });
  });

  describe('subscribe', () => {
    it('should add listener and return unsubscribe function', () => {
      const listener = jest.fn<(event: PlayerEvent) => void>();

      const unsubscribe = bus.subscribe(listener);

      // Listener should be called
      bus.dispatch({ type: 'PLAY' });
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Listener should not be called after unsubscribe
      bus.dispatch({ type: 'PAUSE' });
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should support multiple subscribers', () => {
      const listener1 = jest.fn<(event: PlayerEvent) => void>();
      const listener2 = jest.fn<(event: PlayerEvent) => void>();
      const listener3 = jest.fn<(event: PlayerEvent) => void>();

      bus.subscribe(listener1);
      bus.subscribe(listener2);
      bus.subscribe(listener3);

      bus.dispatch({ type: 'PLAY' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should allow same listener to be subscribed multiple times', () => {
      const listener = jest.fn<(event: PlayerEvent) => void>();

      bus.subscribe(listener);
      bus.subscribe(listener);

      bus.dispatch({ type: 'PLAY' });

      // Should be called twice
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should handle unsubscribe called multiple times', () => {
      const listener = jest.fn<(event: PlayerEvent) => void>();

      const unsubscribe = bus.subscribe(listener);

      unsubscribe();
      unsubscribe(); // Should not throw

      bus.dispatch({ type: 'PLAY' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('clearListeners', () => {
    it('should remove all listeners', () => {
      const listener1 = jest.fn<(event: PlayerEvent) => void>();
      const listener2 = jest.fn<(event: PlayerEvent) => void>();

      bus.subscribe(listener1);
      bus.subscribe(listener2);

      bus.clearListeners();

      bus.dispatch({ type: 'PLAY' });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('getEventHistory', () => {
    it('should return empty array initially', () => {
      const history = bus.getEventHistory();
      expect(history).toEqual([]);
    });

    it('should return copy of history (not reference)', () => {
      bus.dispatch({ type: 'PLAY' });

      const history1 = bus.getEventHistory();
      const history2 = bus.getEventHistory();

      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2); // Different references
    });

    it('should include timestamp for each event', () => {
      const before = Date.now();
      bus.dispatch({ type: 'PLAY' });
      const after = Date.now();

      const history = bus.getEventHistory();

      expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(history[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('dispatchPlayerEvent helper', () => {
    it('should dispatch to global playerEventBus', () => {
      const listener = jest.fn<(event: PlayerEvent) => void>();
      playerEventBus.subscribe(listener);

      dispatchPlayerEvent({ type: 'PLAY' });

      expect(listener).toHaveBeenCalledWith({ type: 'PLAY' });
    });
  });

  describe('edge cases', () => {
    it('should handle rapid event dispatching', () => {
      const listener = jest.fn<(event: PlayerEvent) => void>();
      bus.subscribe(listener);

      // Dispatch 1000 events rapidly
      for (let i = 0; i < 1000; i++) {
        bus.dispatch({ type: 'PLAY' });
      }

      expect(listener).toHaveBeenCalledTimes(1000);
    });

    it('should handle listener that unsubscribes during event', () => {
      let unsubscribe: (() => void) | null = null;

      const listener = jest.fn<(event: PlayerEvent) => void>(() => {
        if (unsubscribe) {
          unsubscribe();
        }
      });

      unsubscribe = bus.subscribe(listener);

      bus.dispatch({ type: 'PLAY' }); // Listener unsubscribes itself
      bus.dispatch({ type: 'PAUSE' }); // Should not be called

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle listener that throws async error', async () => {
      const asyncErrorListener = jest.fn<(event: PlayerEvent) => Promise<void>>(async () => {
        throw new Error('Async error');
      });

      bus.subscribe(asyncErrorListener);

      // Should not throw
      expect(() => bus.dispatch({ type: 'PLAY' })).not.toThrow();

      // Wait a bit for async to potentially error
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Listener should have been called despite error
      expect(asyncErrorListener).toHaveBeenCalled();
    });

    it('should handle null/undefined payload', () => {
      const listener = jest.fn<(event: PlayerEvent) => void>();
      bus.subscribe(listener);

      const event: PlayerEvent = { type: 'PLAY' };
      bus.dispatch(event);

      expect(listener).toHaveBeenCalledWith({ type: 'PLAY' });
    });
  });

  describe('performance', () => {
    it('should handle many subscribers efficiently', () => {
      const listeners: Array<jest.Mock<(event: PlayerEvent) => void>> = [];

      // Add 100 subscribers
      for (let i = 0; i < 100; i++) {
        const listener = jest.fn<(event: PlayerEvent) => void>();
        listeners.push(listener);
        bus.subscribe(listener);
      }

      const start = Date.now();
      bus.dispatch({ type: 'PLAY' });
      const duration = Date.now() - start;

      // Should complete quickly (< 100ms for 100 listeners)
      expect(duration).toBeLessThan(100);

      // All listeners should be called
      listeners.forEach((listener) => {
        expect(listener).toHaveBeenCalledTimes(1);
      });
    });
  });
});
