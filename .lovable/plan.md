# Remove the iOS Share Extension

## Scope

Delete the "Save to Flowist" iOS Share Sheet extension. Keep the HabitsWidget (and its App Group), keep Universal Links, keep the Android share intent code (Android uses a separate mechanism — not affected).

## What gets removed

**Native iOS files (deleted):**
- `ios/App/ShareExtension/` (entire folder — `ShareViewController.swift`, `MainInterface.storyboard`, `Info.plist`)
- ShareExtension target + build phases + embed-app-extension step in `ios/App/App.xcodeproj/project.pbxproj`

**iOS code edits:**
- `ios/App/App/AppDelegate.swift` — remove `import SendIntent`, `ShareStore`, `consumePendingShareItems()`, the `flowist://share` URL handler, and the `triggerSendIntent` notification post
- `ios/App/App/App.entitlements` — leave App Group (widget still needs it) and Associated Domains (universal links); no changes needed
- `ios/App/Podfile` — no changes (no ShareExtension-specific pods)

**TypeScript / app-side:**
- `src/hooks/useShareIntent.ts` — delete (SendIntent listener no longer has anything to receive from iOS; Android side keeps working via `FlowistShareIntentPlugin`, so we split: keep Android path, drop iOS path)
- Remove `send-intent` package from `package.json` if only used for iOS. If Android also uses it, keep it and just gate the listener to Android.
- Any `<SendIntent>` route/component wiring in `App.tsx` / router

## What stays

- HabitsWidget + its App Group `group.nota.npd.com.shareextension` (used by `widgetDataSync.ts` → widget UserDefaults)
- Associated Domains / Universal Links (`applinks:flowist.me`)
- Android share receiver (`FlowistShareIntentPlugin.java`, intent filters in `AndroidManifest.xml`)
- Web Clipper (in-app URL paste flow — unrelated)

## Important: Codemagic build error is separate

Deleting the Share Extension does **not** fix the current archive failure:

```
Provisioning profile "Flowist_Distribution" doesn't support
the App Groups and Associated Domains capability.
```

You still need to, in Apple Developer portal:
1. Enable **App Groups** and **Associated Domains** on App ID `com.flowist.app`
2. Add `group.nota.npd.com.shareextension` to the App Group list (widget needs it)
3. Regenerate & re-download the `Flowist_Distribution` profile

If you want, we can **also** rename the App Group to `group.com.flowist.app` in the same pass so it matches your bundle prefix cleanly — say the word.

## Technical notes

- Removing a target from `project.pbxproj` requires editing multiple sections (`PBXNativeTarget`, `PBXContainerItemProxy`, `PBXTargetDependency`, `PBXCopyFilesBuildPhase` for embed-extension, `XCConfigurationList`). I'll do this via targeted edits and verify with `xcodebuild -list` on your next Codemagic run.
- After merging, on your Mac: `rm -rf ios/App/Pods ios/App/Podfile.lock && npx cap sync ios && cd ios/App && pod install`.
- Users on old builds will lose the "Save to Flowist" share sheet entry on next update — no data migration needed.

## Answer these before I proceed

1. Delete Share Extension only, or also **rename the App Group** to `group.com.flowist.app` in the same pass?
2. Is `send-intent` used on Android in your code? (I'll check, but confirm if you know.)
