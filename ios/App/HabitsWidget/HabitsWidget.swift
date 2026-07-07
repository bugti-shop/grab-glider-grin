// HabitsWidget.swift
// Flowist — iOS home-screen widget that mirrors the Android HabitsListWidget.
//
// • Reads today's progress + due habits from the shared App Group
//   (UserDefaults suite "group.com.flowist.app.shareextension", key
//   "flowist_widget_habits") written by widgetDataSync.syncHabits.
// • Each row is a Link to flowist://widget/todo/habits?check=<id> so the
//   row tap opens the app and cycles status — identical to Android.
// • Each row also exposes Done / Skip Links that route to
//   flowist://widget/todo/habits?action=done|skip&id=<id>; the main app
//   processes these on first paint via the Habits page useEffect handler.
//
// Interactive AppIntent buttons (iOS 17+) can be layered on top later;
// using Links keeps the widget compatible with iOS 14+ and avoids needing
// a separate IntentDefinition.

import WidgetKit
import SwiftUI

// MARK: - Shared payload models

private struct HabitRow: Identifiable, Codable {
    let id: String
    let name: String
    let emoji: String
    let color: String
    let done: Bool
    let streak: Int
    let progress: String
}

private struct HabitsTodayHeader: Codable {
    let done: Int
    let total: Int
    let label: String
}

private struct HabitsPayload: Codable {
    let today: HabitsTodayHeader
    let habits: [HabitRow]
    let lastUpdated: String?
}

private enum HabitsStore {
    /// Must match the App Group enabled on this widget target *and* the
    /// `group` value used in src/utils/widgetDataSync.ts.
    static let suite = "group.com.flowist.app.shareextension"
    /// Key written from JS: `${WIDGET_PREFS_PREFIX}habits` → "flowist_widget_habits".
    /// Capacitor Preferences prefixes stored keys with "CapacitorStorage." —
    /// try both so this works regardless of plugin version.
    static let keys = ["CapacitorStorage.flowist_widget_habits", "flowist_widget_habits"]

    static func load() -> HabitsPayload? {
        guard let defaults = UserDefaults(suiteName: suite) else { return nil }
        for key in keys {
            if let raw = defaults.string(forKey: key),
               let data = raw.data(using: .utf8),
               let parsed = try? JSONDecoder().decode(HabitsPayload.self, from: data) {
                return parsed
            }
        }
        return nil
    }
}

// MARK: - Timeline provider

struct HabitsEntry: TimelineEntry {
    let date: Date
    let header: HabitsTodayHeader
    let habits: [HabitRow]
}

struct HabitsProvider: TimelineProvider {
    private static let placeholderHeader = HabitsTodayHeader(done: 0, total: 0, label: "Today")

    func placeholder(in context: Context) -> HabitsEntry {
        HabitsEntry(date: Date(), header: Self.placeholderHeader, habits: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (HabitsEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HabitsEntry>) -> Void) {
        // Refresh every 30 minutes; WidgetCenter.reloadTimelines is also
        // called from the JS layer on every habit mutation for instant updates.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [currentEntry()], policy: .after(next)))
    }

    private func currentEntry() -> HabitsEntry {
        if let payload = HabitsStore.load() {
            return HabitsEntry(date: Date(), header: payload.today, habits: payload.habits)
        }
        return HabitsEntry(date: Date(), header: Self.placeholderHeader, habits: [])
    }
}

// MARK: - Deep-link helpers

private enum DeepLink {
    static func check(_ id: String) -> URL? {
        URL(string: "flowist://widget/todo/habits?check=\(encode(id))")
    }
    static func done(_ id: String) -> URL? {
        URL(string: "flowist://widget/todo/habits?action=done&id=\(encode(id))")
    }
    static func skip(_ id: String) -> URL? {
        URL(string: "flowist://widget/todo/habits?action=skip&id=\(encode(id))")
    }
    static let open = URL(string: "flowist://widget/todo/habits")!

    private static func encode(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s
    }
}

// MARK: - Views

private struct HabitRowView: View {
    let row: HabitRow

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(tint.opacity(0.18))
                    .frame(width: 30, height: 30)
                Text(row.emoji).font(.system(size: 15))
            }

            // Tap row body → check-in.
            Link(destination: DeepLink.check(row.id) ?? DeepLink.open) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.name)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(meta)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Done action.
            Link(destination: DeepLink.done(row.id) ?? DeepLink.open) {
                Text(row.done ? "✓" : "✓")
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 28, height: 28)
                    .foregroundColor(row.done ? .white : Color.green)
                    .background(row.done ? Color.green : Color.green.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            }

            // Skip action.
            Link(destination: DeepLink.skip(row.id) ?? DeepLink.open) {
                Text("↷")
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 28, height: 28)
                    .foregroundColor(.secondary)
                    .background(Color.gray.opacity(0.18))
                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            }
        }
        .padding(.vertical, 4)
    }

    private var tint: Color {
        Color(hex: row.color) ?? Color.blue
    }

    private var meta: String {
        if row.done { return "Done • \(row.streak)🔥" }
        let streakPart = row.streak > 0 ? "\(row.streak)🔥" : "Tap to check in"
        if !row.progress.isEmpty { return "\(row.progress) • \(streakPart)" }
        return streakPart
    }
}

struct HabitsWidgetEntryView: View {
    var entry: HabitsProvider.Entry
    @Environment(\.widgetFamily) var family

    private var maxRows: Int {
        switch family {
        case .systemSmall: return 2
        case .systemMedium: return 3
        case .systemLarge: return 6
        default: return 4
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("HABITS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.primary)
                    .tracking(0.8)
                Spacer()
                Text(progressLabel)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color.blue)
            }

            if entry.habits.isEmpty {
                Spacer()
                Text("No habits due today.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                Spacer()
            } else {
                ForEach(Array(entry.habits.prefix(maxRows))) { row in
                    HabitRowView(row: row)
                    if row.id != entry.habits.prefix(maxRows).last?.id {
                        Divider().opacity(0.4)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .widgetURL(DeepLink.open)
    }

    private var progressLabel: String {
        if entry.header.total == 0 { return "Nothing today" }
        return "\(entry.header.done) / \(entry.header.total) today"
    }
}

// MARK: - Widget entry point

struct HabitsWidget: Widget {
    let kind: String = "HabitsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HabitsProvider()) { entry in
            HabitsWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Habits")
        .description("Today's habits with quick Done and Skip actions.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Color hex helper

private extension Color {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt64(s, radix: 16) else { return nil }
        let r = Double((v >> 16) & 0xFF) / 255.0
        let g = Double((v >> 8) & 0xFF) / 255.0
        let b = Double(v & 0xFF) / 255.0
        self = Color(red: r, green: g, blue: b)
    }
}
