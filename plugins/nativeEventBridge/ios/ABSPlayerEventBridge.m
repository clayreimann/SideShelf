#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ABSPlayerEventBridge, RCTEventEmitter)

RCT_EXTERN_METHOD(dispatch:(NSDictionary *)eventData)

@end
