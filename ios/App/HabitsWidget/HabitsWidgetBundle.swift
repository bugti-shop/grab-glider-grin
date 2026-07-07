// HabitsWidgetBundle.swift
// Flowist — iOS WidgetKit bundle for the Habits home-screen widget.
//
// This file is the entry point for the widget extension target. Add this
// folder to the Xcode project as a new "Widget Extension" target named
// "HabitsWidget" and enable the App Group
// `group.com.flowist.app.shareextension` on the target so it can read the
// payload written by widgetDataSync.syncHabits on the JS side.

import WidgetKit
import SwiftUI

@main
struct HabitsWidgetBundle: WidgetBundle {
    var body: some Widget {
        HabitsWidget()
    }
}
