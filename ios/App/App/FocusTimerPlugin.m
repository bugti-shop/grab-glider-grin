#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Exposes the Swift FocusTimerPlugin to Capacitor's Objective-C plugin registry.
// Without this macro, `registerPlugin('FocusTimerNative', ...)` from JS
// cannot find the native implementation.
CAP_PLUGIN(FocusTimerPlugin, "FocusTimerNative",
    CAP_PLUGIN_METHOD(start,     CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop,      CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setPaused, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setMuted,  CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setVolume, CAPPluginReturnPromise);
)
