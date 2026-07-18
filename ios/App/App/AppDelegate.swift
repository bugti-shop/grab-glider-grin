import UIKit
import Capacitor
import GoogleSignIn
import SendIntent

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private let shareStore = ShareStore.store
    private let appGroupId = "group.com.flowist.app.shareextension"

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Install compressed asset handler + long-cache headers for the WKWebView
        // that serves our bundled `dist/` output. See WebViewAssetHandler+Compression.swift.
        FlowistAssetCompression.install()

        // Manually register the Focus timer plugin (auto-discovery only picks up
        // Objective-C wrapped classes; our Swift plugin is exposed via @objc).
        return true
    }


    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }

        if url.scheme == "flowist", url.host == "share" {
            consumePendingShareItems()
            return true
        }

        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    private func consumePendingShareItems() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        guard let items = defaults.array(forKey: "sharedItems") as? [[String: String]], !items.isEmpty else { return }

        shareStore.shareItems.removeAll()
        for item in items {
            var shareItem = JSObject()
            shareItem["title"] = item["title"] ?? ""
            shareItem["description"] = item["description"] ?? ""
            shareItem["type"] = item["type"] ?? ""
            shareItem["url"] = item["url"] ?? ""
            shareStore.shareItems.append(shareItem)
        }

        // Clear the App Group payload as soon as it has been moved into the
        // in-memory send-intent store. Otherwise iOS can replay the last clip
        // whenever the app opens again, creating repeated article copies.
        defaults.removeObject(forKey: "sharedItems")
        defaults.synchronize()

        shareStore.processed = false
        NotificationCenter.default.post(name: Notification.Name("triggerSendIntent"), object: nil)
    }

    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application,
            continue: userActivity, restorationHandler: restorationHandler)
    }
}
