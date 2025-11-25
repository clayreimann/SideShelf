import Foundation
import React

@objc(ABSPlayerEventBridge)
class ABSPlayerEventBridge: RCTEventEmitter {
  
  public static var emitter: ABSPlayerEventBridge?
  
  override init() {
    super.init()
    ABSPlayerEventBridge.emitter = self
  }
  
  override func supportedEvents() -> [String]! {
    return ["ABSPlayerEvent"]
  }
  
  @objc
  func dispatch(_ eventData: NSDictionary) {
    sendEvent(withName: "ABSPlayerEvent", body: eventData)
  }
  
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
