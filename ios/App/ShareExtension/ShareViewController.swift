//
//  ShareViewController.swift
//  Flowist Share Extension
//
//  Receives content (URL / selected text / page snippet) from any iOS
//  app's Share sheet, writes it to the App Group's shared UserDefaults
//  under the `sharedItems` key, then opens the main Flowist app via
//  the custom URL scheme. The main app's `send-intent` plugin then
//  reads the App Group payload and `useShareIntent` forwards it to
//  /webclipper.
//
//  REQUIRED Xcode wiring (manual — must be done on your Mac):
//   1. Open `ios/App/App.xcworkspace`.
//   2. File → New → Target → Share Extension. Name: "ShareExtension",
//      Bundle ID suffix: `.shareextension`.
//   3. Replace the generated `ShareViewController.swift` with THIS file.
//   4. Replace the generated `Info.plist` with `Info.plist` from this
//      same folder (handles text + URL activation rules).
//   5. In both the App target AND the ShareExtension target:
//        Signing & Capabilities → + Capability → App Groups
//        → add `group.nota.npd.com.shareextension`
//   6. Add a URL scheme to the main app's Info.plist:
//        CFBundleURLSchemes → ["flowist"]
//   7. Build → Run on a device or simulator.
//
//  See SHARE_CLIPPER_TESTING.md for the end-to-end checklist.
//

import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    // MUST match the App Group ID added in Signing & Capabilities for
    // BOTH the main app target and this extension target.
    private let appGroupId = "group.nota.npd.com.shareextension"

    // Main app's custom URL scheme — defined in the main app's Info.plist
    // under CFBundleURLTypes → CFBundleURLSchemes.
    private let hostAppScheme = "flowist"

    override func viewDidLoad() {
        super.viewDidLoad()
        handleSharedContent()
    }

    private func handleSharedContent() {
        guard
            let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
            let attachments = extensionItem.attachments
        else {
            completeRequest()
            return
        }

        var collected: [[String: String]] = []
        let group = DispatchGroup()

        for provider in attachments {
            // Plain text (selection share from Safari, Notes, etc.)
            if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                    if let text = item as? String {
                        collected.append([
                            "title": extensionItem.attributedContentText?.string ?? "Shared text",
                            "type": "text/plain",
                            "url": text
                        ])
                    }
                    group.leave()
                }
            }
            // URL (link share from Chrome, Safari, Twitter, etc.)
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                    if let url = item as? URL {
                        collected.append([
                            "title": extensionItem.attributedContentText?.string ?? url.host ?? "Shared link",
                            "type": "text/url",
                            "url": url.absoluteString
                        ])
                    }
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            self.persistToAppGroup(items: collected)
            self.openHostApp()
            self.completeRequest()
        }
    }

    private func persistToAppGroup(items: [[String: String]]) {
        guard
            !items.isEmpty,
            let defaults = UserDefaults(suiteName: appGroupId)
        else { return }
        // The `send-intent` plugin reads this key on the JS side.
        defaults.set(items, forKey: "sharedItems")
        defaults.synchronize()
    }

    private func openHostApp() {
        guard let url = URL(string: "\(hostAppScheme)://share") else { return }
        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication {
                app.perform(#selector(UIApplication.open(_:options:completionHandler:)),
                            with: url, with: nil)
                return
            }
            responder = r.next
        }
        // Fallback for iOS 18+: openURL via the extensionContext if available.
        _ = self.extensionContext?.open(url, completionHandler: nil)
    }

    private func completeRequest() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
