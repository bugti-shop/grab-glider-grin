import Foundation
import Capacitor
import AVFoundation
import UserNotifications
import MediaPlayer

/// iOS equivalent of the Android FocusForegroundService.
///
/// Responsibilities:
/// - Play the selected ambient sound with `AVAudioPlayer` on the `.playback`
///   audio session so it survives lock/background (requires the `audio`
///   UIBackgroundMode key in Info.plist).
/// - Post an ongoing local notification with Pause/Resume, Mute/Unmute,
///   Volume −/+, and Exit actions the user can tap without opening the app.
/// - Re-fire a completion notification at the exact `endAtMs`.
/// - Emit `focusQuickControl` events back to JS so the in-app FocusMode UI
///   stays in sync with anything the user did from the lock screen.
@objc(FocusTimerPlugin)
public class FocusTimerPlugin: CAPPlugin {
    private static let categoryId = "FLOWIST_FOCUS"
    private static let ongoingId  = "flowist-focus-ongoing"
    private static let completeId = "flowist-focus-complete"

    private var player: AVAudioPlayer?
    private var refreshTimer: Timer?
    private var completionTimer: Timer?
    private var taskTitle: String = ""
    private var endAtMs: Double = 0
    private var remainingSec: Int = 0
    private var running: Bool = true
    private var soundUrlStr: String = ""
    private var soundVolume: Float = 0.4
    private var muted: Bool = false

    override public func load() {
        registerNotificationCategory()
        UNUserNotificationCenter.current().delegate = NotificationRouter.shared
        NotificationRouter.shared.plugin = self
    }

    @objc func start(_ call: CAPPluginCall) {
        taskTitle = call.getString("taskTitle") ?? ""
        remainingSec = call.getInt("remainingSec") ?? remainingSec
        if let end = call.getDouble("endAtMs") { endAtMs = end }
        running = call.getBool("running") ?? true
        let newUrl = call.getString("soundUrl") ?? ""
        let newVol = Float(call.getDouble("soundVolume") ?? Double(soundVolume))
        let urlChanged = newUrl != soundUrlStr
        soundUrlStr = newUrl
        soundVolume = max(0, min(1, newVol))
        if urlChanged { stopPlayer() }
        applyAudioState()
        requestPermissionAndPost()
        scheduleCompletion()
        startRefreshLoop()
        call.resolve(["ok": true])
    }

    @objc func stop(_ call: CAPPluginCall) {
        teardown()
        call.resolve(["ok": true])
    }

    // MARK: - Quick controls from JS side (kept for symmetry)
    @objc func setPaused(_ call: CAPPluginCall) {
        running = !(call.getBool("paused") ?? false)
        applyAudioState()
        postOngoing()
        call.resolve(["ok": true])
    }
    @objc func setMuted(_ call: CAPPluginCall) {
        muted = call.getBool("muted") ?? false
        player?.volume = muted ? 0 : soundVolume
        postOngoing()
        call.resolve(["ok": true])
    }
    @objc func setVolume(_ call: CAPPluginCall) {
        soundVolume = max(0, min(1, Float(call.getDouble("volume") ?? Double(soundVolume))))
        if !muted { player?.volume = soundVolume }
        postOngoing()
        call.resolve(["ok": true])
    }

    // MARK: - Audio
    private func applyAudioState() {
        if running && !soundUrlStr.isEmpty && !muted {
            startPlayer()
        } else if !running {
            player?.pause()
        }
        player?.volume = muted ? 0 : soundVolume
    }

    private func startPlayer() {
        guard let url = URL(string: soundUrlStr) else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true, options: [])
        } catch { /* audio session may still work */ }

        if player == nil || player?.url != url {
            // Stream via URLSession → local temp so AVAudioPlayer can loop it.
            // For simple hosted MP3s this is instant.
            do {
                let data = try Data(contentsOf: url)
                let p = try AVAudioPlayer(data: data)
                p.numberOfLoops = -1
                p.volume = muted ? 0 : soundVolume
                p.prepareToPlay()
                p.play()
                player = p
            } catch {
                player = nil
            }
        } else if let p = player, !p.isPlaying {
            p.play()
        }
    }

    private func stopPlayer() {
        player?.stop()
        player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    // MARK: - Notifications
    private func registerNotificationCategory() {
        let pause  = UNNotificationAction(identifier: "PAUSE",  title: "Pause",   options: [])
        let resume = UNNotificationAction(identifier: "RESUME", title: "Resume",  options: [])
        let mute   = UNNotificationAction(identifier: "MUTE",   title: "Mute",    options: [])
        let unmute = UNNotificationAction(identifier: "UNMUTE", title: "Unmute",  options: [])
        let volDn  = UNNotificationAction(identifier: "VOL_DN", title: "Vol −",   options: [])
        let volUp  = UNNotificationAction(identifier: "VOL_UP", title: "Vol +",   options: [])
        let exit   = UNNotificationAction(identifier: "EXIT",   title: "Exit",    options: [.destructive])
        let category = UNNotificationCategory(
            identifier: Self.categoryId,
            actions: [pause, resume, mute, unmute, volDn, volUp, exit],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    private func requestPermissionAndPost() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.postOngoing() }
        }
    }

    private func fmt(_ sec: Int) -> String {
        let s = max(0, sec); let h = s/3600; let m = (s%3600)/60; let r = s%60
        let pad: (Int) -> String = { $0 < 10 ? "0\($0)" : "\($0)" }
        return h > 0 ? "\(h):\(pad(m)):\(pad(r))" : "\(m):\(pad(r))"
    }

    private func postOngoing() {
        let content = UNMutableNotificationContent()
        content.title = running ? "🎯 Focus running" : "⏸ Focus paused"
        var body = "\(fmt(remainingSec)) remaining"
        if !taskTitle.isEmpty { body += " · \(taskTitle)" }
        let volPct = Int((muted ? 0 : soundVolume) * 100)
        if !soundUrlStr.isEmpty { body += " · Vol \(volPct)%\(muted ? " (muted)" : "")" }
        content.body = body
        content.categoryIdentifier = Self.categoryId
        content.threadIdentifier = "flowist-focus"
        content.interruptionLevel = .passive

        let req = UNNotificationRequest(
            identifier: Self.ongoingId,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        )
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    private func scheduleCompletion() {
        completionTimer?.invalidate()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.completeId])
        guard running, endAtMs > Date().timeIntervalSince1970 * 1000 else { return }
        let fireInterval = max(1, (endAtMs / 1000) - Date().timeIntervalSince1970)
        let content = UNMutableNotificationContent()
        content.title = "✅ Focus complete"
        content.body = taskTitle.isEmpty ? "Great work!" : "Great work! · \(taskTitle)"
        content.sound = .default
        let req = UNNotificationRequest(
            identifier: Self.completeId,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: fireInterval, repeats: false)
        )
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    private func startRefreshLoop() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let s = self, s.running, s.endAtMs > 0 else { return }
            s.remainingSec = max(0, Int((s.endAtMs - Date().timeIntervalSince1970 * 1000) / 1000))
            s.postOngoing()
        }
    }

    private func teardown() {
        refreshTimer?.invalidate(); refreshTimer = nil
        completionTimer?.invalidate(); completionTimer = nil
        stopPlayer()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [Self.ongoingId, Self.completeId]
        )
    }

    // MARK: - Actions from the notification
    func handleAction(_ id: String) {
        switch id {
        case "PAUSE":  running = false; applyAudioState()
        case "RESUME": running = true;  applyAudioState()
        case "MUTE":   muted = true;    player?.volume = 0
        case "UNMUTE": muted = false;   player?.volume = soundVolume
        case "VOL_DN": soundVolume = max(0, soundVolume - 0.1); if !muted { player?.volume = soundVolume }
        case "VOL_UP": soundVolume = min(1, soundVolume + 0.1); if !muted { player?.volume = soundVolume }
        case "EXIT":   notifyListeners("focusQuickControl", data: ["action": "stop"]); teardown(); return
        default: break
        }
        notifyListeners("focusQuickControl", data: [
            "action": id.lowercased(),
            "running": running,
            "muted": muted,
            "volume": Double(soundVolume)
        ])
        postOngoing()
    }
}

/// Routes UNUserNotificationCenter action taps back into the plugin instance.
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationRouter()
    weak var plugin: FocusTimerPlugin?

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let id = response.actionIdentifier
        if id != UNNotificationDefaultActionIdentifier && id != UNNotificationDismissActionIdentifier {
            plugin?.handleAction(id)
        }
        completionHandler()
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
}
