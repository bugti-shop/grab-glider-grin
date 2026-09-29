#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(FlowistAlarmPlugin, "FlowistAlarm",
    CAP_PLUGIN_METHOD(schedule, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(cancel, CAPPluginReturnPromise);
)