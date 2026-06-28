# End-to-End Test Checklist — Web Clipper Share Integration

This document covers Android intent-filter + iOS Share Extension + in-app
clip flow. Automated unit smoke tests live in `src/test/webClipper.test.ts`
(run via the test runner).

---

## 0. Prerequisites

- [ ] `bun install` (pulls in `send-intent@^7`)
- [ ] `npx cap sync android` after Android changes
- [ ] `npx cap sync ios` after iOS changes
- [ ] Unit tests green: run the vitest suite, all `webClipper.*` tests must pass

---

## 1. Web build (regression check)

Web is the existing baseline — the share-intent hook should be a no-op.

- [ ] Open `https://flowist.me/webclipper?title=Hello&url=https://example.com&mode=article` — note auto-creates, redirects to `/notesdashboard`
- [ ] Same URL without `&mode=` — the **Article / Selection / Full page** picker shows; selecting a mode and tapping "Save clip" creates the note
- [ ] `javascript:alert(1)` passed as `url` — sanitized away (no link in saved note)
- [ ] Open `/webclipper` with no params — page renders without crashing

---

## 2. Android end-to-end

### Build
- [ ] `npx cap sync android && npx cap open android`
- [ ] Build & deploy debug APK to a real device (emulators don't always show the share sheet)

### Share from Chrome (URL)
- [ ] Open any article in Chrome → tap ⋮ → **Share** → tap **Flowist** in the sheet
- [ ] App launches (or resumes), navigates to `/webclipper` automatically
- [ ] Mode is **Article** (because payload is a pure URL), saves automatically
- [ ] Returns to `/notesdashboard` within ~1.2s; new note appears at top

### Share text selection from Chrome / any app
- [ ] Long-press text in any article → **Share** → **Flowist**
- [ ] Picker (or auto-save) treats this as **Selection** mode (quoted block in note body)
- [ ] If the selection contains a URL, the URL is split into `**Source:**` and the rest into the blockquote

### Edge cases
- [ ] Share when app is **killed** — cold-start, share still lands in /webclipper
- [ ] Share when app is **backgrounded** — warm-start, share still lands (the `sendIntentReceived` event handler)
- [ ] Share **very long text** (>10k chars) — truncated to MAX_LENGTHS.selection, no crash
- [ ] Share a **`data:` or `javascript:` URL** (forge with a custom app) — rejected by `validateUrl`, note still saves with only the text body
- [ ] Airplane mode share → note saved locally; goes through cloud sync when network returns

---

## 3. iOS end-to-end

### One-time Xcode setup
See header of `ios/App/ShareExtension/ShareViewController.swift`. Summary:
1. Add a **Share Extension** target in Xcode
2. Drop in the scaffolded `ShareViewController.swift` + `Info.plist`
3. Enable **App Groups** capability on BOTH targets: `group.nota.npd.com.shareextension`
4. Add `flowist` to `CFBundleURLSchemes` on the main app target's Info.plist
5. Build & run on device or simulator

### Share from Safari (URL)
- [ ] Safari → any page → Share → tap **Save to Flowist**
- [ ] Extension flashes, dismisses, host app opens via `flowist://share`
- [ ] `useShareIntent` reads the App Group payload → `/webclipper?mode=article…` → saves note
- [ ] New note visible in `/notesdashboard`

### Share text selection
- [ ] Highlight text in Safari/Notes → Share → **Save to Flowist**
- [ ] Saved as **Selection** mode (quoted body)

### Edge cases (iOS)
- [ ] App killed — first share cold-starts host app, payload still arrives
- [ ] Share when host app is foreground — picker still appears, save still works
- [ ] Two shares in a row — second one is read after `appStateChange` fires on resume

---

## 4. Automated smoke tests

`src/test/webClipper.test.ts` covers the pure logic (no DOM/browser needed):

- URL protocol allow-list (rejects javascript/data/file)
- HTML stripping + length truncation
- Markdown escaping (link-injection prevention)
- Mode normalisation (`full-page` → `fullpage`, default `article`)
- URL-in-text extraction for selection shares
- Note body assembly per mode (selection vs article)
- Clipper URL builder respects `MAX_LENGTHS`

Run them in CI on every push; they exercise the same code path both the
share intent hook and the /webclipper page rely on.

---

## 5. Manual debugging tips

- **Android intent not showing Flowist?** Check `AndroidManifest.xml` has
  the SEND intent-filter with `text/plain` AND `text/*`. Re-run
  `npx cap sync android`.
- **iOS extension shows but doesn't open the app?** Verify `flowist://`
  scheme is registered in the main app's Info.plist and the App Group ID
  matches exactly on both targets.
- **App opens but /webclipper doesn't trigger?** `useShareIntent` logs a
  warning when the `send-intent` plugin is unavailable — check Xcode/Android
  Studio logcat for `[shareIntent]`.
- **Note saves blank?** The `validateUrl` allow-list may have rejected the
  payload. Inspect with `console.log` in `extractUrlAndText`.
