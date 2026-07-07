//
//  ShareViewController.swift
//  Flowist Share Extension
//
//  Receives content (URL / selected text / image / PDF) from any iOS
//  app's Share sheet, writes it to the App Group's shared UserDefaults
//  under the `sharedItems` key, then opens the main Flowist app via
//  the `flowist://` URL scheme. The main app's `send-intent` plugin
//  then reads the App Group payload and `useShareIntent` forwards it
//  to /webclipper.
//

import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    // MUST match the App Group ID added in Signing & Capabilities for
    // BOTH the main app target and this extension target.
    private let appGroupId = "group.com.flowist.app.shareextension"
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
        let titleHint = extensionItem.attributedContentText?.string

        for provider in attachments {
            // ---- Plain text (selection / snippet) ----
            if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                    if let text = item as? String {
                        collected.append([
                            "title": titleHint ?? "Shared text",
                            "type": "text/plain",
                            "url": text
                        ])
                    }
                    group.leave()
                }
            }

            // ---- URL (link share from Chrome, Safari, Twitter…) ----
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                    if let url = item as? URL {
                        collected.append([
                            "title": titleHint ?? url.host ?? "Shared link",
                            "type": "text/url",
                            "url": url.absoluteString
                        ])
                    }
                    group.leave()
                }
            }

            // ---- Image (from Photos / Files / camera roll) ----
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { item, _ in
                    defer { group.leave() }
                    if let url = item as? URL, let saved = self.copyToAppGroup(srcURL: url, ext: url.pathExtension.isEmpty ? "jpg" : url.pathExtension) {
                        collected.append([
                            "title": titleHint ?? "Shared image",
                            "type": "image/*",
                            "url": saved.absoluteString
                        ])
                    } else if let img = item as? UIImage,
                              let data = img.jpegData(compressionQuality: 0.92),
                              let saved = self.writeDataToAppGroup(data: data, ext: "jpg") {
                        collected.append([
                            "title": titleHint ?? "Shared image",
                            "type": "image/*",
                            "url": saved.absoluteString
                        ])
                    }
                }
            }

            // ---- PDF ----
            if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.pdf.identifier, options: nil) { item, _ in
                    defer { group.leave() }
                    if let url = item as? URL, let saved = self.copyToAppGroup(srcURL: url, ext: "pdf") {
                        collected.append([
                            "title": titleHint ?? url.lastPathComponent,
                            "type": "application/pdf",
                            "url": saved.absoluteString
                        ])
                    }
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

    // Persists binary attachments into the App Group container so the
    // main app can read them as `file://` URLs.
    private func copyToAppGroup(srcURL: URL, ext: String) -> URL? {
        guard let containerURL = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else { return nil }
        let inboxDir = containerURL.appendingPathComponent("shareInbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: inboxDir, withIntermediateDirectories: true)
        let dest = inboxDir.appendingPathComponent("\(UUID().uuidString).\(ext)")
        do {
            if FileManager.default.fileExists(atPath: dest.path) {
                try FileManager.default.removeItem(at: dest)
            }
            try FileManager.default.copyItem(at: srcURL, to: dest)
            return dest
        } catch {
            return nil
        }
    }

    private func writeDataToAppGroup(data: Data, ext: String) -> URL? {
        guard let containerURL = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else { return nil }
        let inboxDir = containerURL.appendingPathComponent("shareInbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: inboxDir, withIntermediateDirectories: true)
        let dest = inboxDir.appendingPathComponent("\(UUID().uuidString).\(ext)")
        do {
            try data.write(to: dest)
            return dest
        } catch {
            return nil
        }
    }

    private func persistToAppGroup(items: [[String: String]]) {
        guard
            !items.isEmpty,
            let defaults = UserDefaults(suiteName: appGroupId)
        else { return }
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
        _ = self.extensionContext?.open(url, completionHandler: nil)
    }

    private func completeRequest() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
