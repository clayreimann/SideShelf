import { PlayerEvent } from "@/types/coordinator";
import { NativeBridge } from "../../nativeEventBridge";
import { PlayerEventBus } from "../eventBus";
import { NativeBridgeIntegrator } from "../nativeBridgeIntegrator";

// Mock NativeBridge
jest.mock("../../nativeEventBridge", () => ({
  NativeBridge: {
    dispatch: jest.fn(),
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

describe("NativeBridgeIntegrator", () => {
  let eventBus: PlayerEventBus;
  let integrator: NativeBridgeIntegrator;
  let nativeListener: (event: any) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = new PlayerEventBus();
    integrator = new NativeBridgeIntegrator(eventBus);

    // Capture the native listener when it's added
    (NativeBridge.addListener as jest.Mock).mockImplementation((event, listener) => {
      nativeListener = listener;
      return { remove: jest.fn() };
    });

    integrator.initialize();
  });

  afterEach(() => {
    integrator.cleanup();
  });

  it("should broadcast local events to native bridge", () => {
    const event: PlayerEvent = { type: "PLAY" };
    eventBus.dispatch(event);

    expect(NativeBridge.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PLAY",
        __contextId: expect.stringMatching(/^ctx-/),
      })
    );
  });

  it("should dispatch native events to local event bus", () => {
    const dispatchSpy = jest.spyOn(eventBus, "dispatch");
    const nativeEvent = {
      type: "PAUSE",
      payload: { some: "data" },
      __contextId: "other-context",
    };

    // Simulate native event
    nativeListener(nativeEvent);

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "PAUSE",
      payload: { some: "data" },
    });
  });

  it("should prevent echo (not dispatch native events back to native)", () => {
    const nativeEvent = {
      type: "PAUSE",
      __contextId: "other-context",
    };

    // Simulate native event
    nativeListener(nativeEvent);

    // Should dispatch to local bus
    // But should NOT broadcast back to native
    expect(NativeBridge.dispatch).not.toHaveBeenCalled();
  });

  it("should ignore events from its own context ID", () => {
    const dispatchSpy = jest.spyOn(eventBus, "dispatch");
    
    // Get the context ID used by the integrator
    // We can trigger a local event to capture the ID from the dispatch call
    eventBus.dispatch({ type: "PLAY" });
    const contextId = (NativeBridge.dispatch as jest.Mock).mock.calls[0][0].__contextId;
    
    (NativeBridge.dispatch as jest.Mock).mockClear();
    dispatchSpy.mockClear();

    // Simulate echo event
    nativeListener({
      type: "PLAY",
      __contextId: contextId,
    });

    // Should NOT dispatch to local bus
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
