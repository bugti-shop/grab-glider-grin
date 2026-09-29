import Foundation
import Capacitor
import UserNotifications

/// iOS delivers scheduled notifications after termination, but never grants third-party
/// apps a Clock-style lock-screen takeover or indefinitely looping notification audio.
enum FlowistAlarmNotifications {
    static let category = "FLOWIST_ALARM"
    static let prefix = "flowist-alarm-"

    static func configure() {
        let snooze = UNNotificationAction(identifier: "FLOWIST_SNOOZE", title: "Snooze 5 min", options: [])
        let dismiss = UNNotificationAction(identifier: "FLOWIST_DISMISS", title: "Dismiss", options: [.destructive])
        let alarm = UNNotificationCategory(identifier: category, actions: [snooze, dismiss], intentIdentifiers: [], options: [.customDismissAction])
        let center = UNUserNotificationCenter.current()
        center.getNotificationCategories { existing in
            center.setNotificationCategories(existing.filter { $0.identifier != category }.union([alarm]))
        }
    }

    static func handle(_ response: UNNotificationResponse) -> Bool {
        guard response.notification.request.content.categoryIdentifier == category else { return false }
        let center = UNUserNotificationCenter.current()
        let id = response.notification.request.identifier
        if response.actionIdentifier == "FLOWIST_SNOOZE" {
            let previous = response.notification.request.content
            let content = UNMutableNotificationContent()
            content.title = previous.title
            content.body = previous.body
            content.categoryIdentifier = category
            content.userInfo = previous.userInfo
            content.interruptionLevel = previous.interruptionLevel
            content.sound = previous.sound
            center.add(UNNotificationRequest(identifier: id + "-snooze", content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: 300, repeats: false)))
        }
        center.removeDeliveredNotifications(withIdentifiers: [id])
        return true
    }
}

@objc(FlowistAlarmPlugin)
public class FlowistAlarmPlugin: CAPPlugin {
    override public func load() { FlowistAlarmNotifications.configure() }

    @objc func schedule(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty,
              let when = call.getDouble("when"), when > Date().timeIntervalSince1970 * 1000 else {
            call.reject("Invalid alarm time or key")
            return
        }
        let title = call.getString("title") ?? "Reminder"
        let priority = call.getString("priority") ?? "None"
        let repeatDays = call.getInt("repeatDays") ?? 0
        let center = UNUserNotificationCenter.current()
        let id = FlowistAlarmNotifications.prefix + key
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = priority == "None" ? "Flowist reminder" : "Priority: \(priority)"
        content.categoryIdentifier = FlowistAlarmNotifications.category
        content.userInfo = ["key": key, "priority": priority]
        content.interruptionLevel = .timeSensitive
        content.sound = .default

        // Critical Alerts are deliberately not requested without Apple's restricted
        // entitlement. When approved and provisioned, enable FLOWIST_CRITICAL_ALERTS
        // in the signed iOS target and add the critical-alert entitlement.
        #if FLOWIST_CRITICAL_ALERTS
        content.interruptionLevel = .critical
        content.sound = UNNotificationSound.defaultCritical
        #endif

        let date = Date(timeIntervalSince1970: when / 1000)
        let trigger: UNNotificationTrigger
        if repeatDays == 7 {
            let fields = Calendar.current.dateComponents([.weekday, .hour, .minute], from: date)
            trigger = UNCalendarNotificationTrigger(dateMatching: fields, repeats: true)
        } else {
            trigger = UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date), repeats: false)
        }
        // Replace the matching Capacitor local notification to avoid double alerts.
        if let replacementId = call.getInt("replacementId") {
            center.removePendingNotificationRequests(withIdentifiers: [String(replacementId)])
        }
        center.removePendingNotificationRequests(withIdentifiers: [id, id + "-snooze"])
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { error in
            if let error = error { call.reject("Unable to schedule iOS reminder: \(error.localizedDescription)") }
            else { call.resolve() }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else { call.reject("Missing alarm key"); return }
        let id = FlowistAlarmNotifications.prefix + key
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id, id + "-snooze"])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [id, id + "-snooze"])
        call.resolve()
    }
}