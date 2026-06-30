# Habits Widget (iOS)

Mirrors the Android `HabitsListWidget`. Shows today's progress header and
the list of due habits with quick **Done** / **Skip** actions. Tapping the
row deep-links into the app and cycles the habit status.

## One-time Xcode setup

Lovable generates the Swift sources, the widget `Info.plist`, and the
extension entitlements file. The Xcode target itself must be added once:

1. Open `ios/App/App.xcworkspace` in Xcode.
2. **File → New → Target… → Widget Extension**.
   - Product Name: **HabitsWidget**
   - Bundle Identifier: `com.flowist.app.HabitsWidget`
   - Include Configuration Intent: **off**
   - Embed in Application: **App**
3. Delete the placeholder files Xcode generated inside the new target
   group, then drag in the files from `ios/App/HabitsWidget/`
   (`HabitsWidget.swift`, `HabitsWidgetBundle.swift`, `Info.plist`,
   `HabitsWidget.entitlements`) — choose "Create folder references" and
   add to the **HabitsWidget** target only.
4. In Signing & Capabilities for the **HabitsWidget** target:
   - Add **App Groups** → enable
     `group.nota.npd.com.shareextension` (same group used by the
     ShareExtension and the main app).
   - Set the entitlements file to `HabitsWidget/HabitsWidget.entitlements`.
5. Build & run on a device. Long-press the home screen → add the
   "Flowist – Habits" widget.

## Data flow

```
JS (widgetDataSync.syncHabits)
  └─ Capacitor Preferences (group: shareextension)
        key: flowist_widget_habits
              ↓
UserDefaults(suiteName: "group.nota.npd.com.shareextension")
              ↓
HabitsProvider → HabitsWidgetEntryView
```

The JS layer calls `widgetDataSync.syncHabits()` on every `habitsUpdated`
event. To force the widget to redraw immediately call
`WidgetCenter.shared.reloadTimelines(ofKind: "HabitsWidget")` from a
Capacitor plugin if you need sub-30-minute refreshes.

## Deep links

| Action  | URL                                                      |
| ------- | -------------------------------------------------------- |
| Open    | `flowist://widget/todo/habits`                           |
| Row tap | `flowist://widget/todo/habits?check=<id>`                |
| Done    | `flowist://widget/todo/habits?action=done&id=<id>`       |
| Skip    | `flowist://widget/todo/habits?action=skip&id=<id>`       |

The app reads these in `src/pages/todo/Habits.tsx` and updates the habit
without showing a transient UI flash. The `flowist://` URL scheme is
already registered in `ios/App/App/Info.plist`.
