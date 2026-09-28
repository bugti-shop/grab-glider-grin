# Architecture rules

- Use Capacitor SystemBars' measured Android bottom inset together with WebView safe-area inset for `--safe-bottom`; different navigation modes and WebView versions need device-reported spacing rather than fixed heights.
- Use native Android AlarmClock intents and a device-local reboot-restorable registry alongside existing local notifications; JS timers cannot wake a killed app or locked device.