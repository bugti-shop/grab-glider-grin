//
//  WebViewAssetHandler+Compression.swift
//  Flowist
//
//  Adds gzip / brotli response support and aggressive long-cache headers to
//  Capacitor's built-in WKURLSchemeHandler (`WebViewAssetHandler`). Vite
//  pre-generates `.gz` and `.br` siblings for every hashed JS/CSS bundle
//  (see vite.config.ts). At request time we:
//
//    1. Inspect the incoming `Accept-Encoding` header.
//    2. Prefer `.br`, fall back to `.gz`, else serve the raw file.
//    3. Return the correct `Content-Encoding` + `Content-Type` headers so
//       WKWebView transparently decompresses in native code.
//    4. Attach `Cache-Control: public, max-age=31536000, immutable` for any
//       fingerprinted asset path (`/assets/…-<hash>.<ext>`) so WKWebView can
//       reuse parsed resources across cold launches and cut warm-start memory.
//
//  Everything runs through Objective-C method swizzling and is guarded by
//  `try?` / nil checks — if Capacitor changes the internal class name in a
//  future release we silently fall back to the stock handler.
//

import Foundation
import UIKit
import Capacitor
import ObjectiveC.runtime
import WebKit

@objc final class FlowistAssetCompression: NSObject {

    // Called once, from AppDelegate.didFinishLaunching.
    @objc static func install() {
        // 1) Enlarge the shared URLCache. WKWebView uses this cache for
        //    subresources loaded via URLSession-backed paths, and a bigger
        //    memory/disk budget noticeably reduces re-parses on relaunch.
        URLCache.shared = URLCache(
            memoryCapacity: 32 * 1024 * 1024,       // 32 MB RAM
            diskCapacity:   256 * 1024 * 1024,      // 256 MB disk
            diskPath: "flowist-webview-cache"
        )

        // 2) Swizzle Capacitor's asset handler.
        guard let handlerClass = NSClassFromString("Capacitor.WebViewAssetHandler")
                ?? NSClassFromString("WebViewAssetHandler") else {
            NSLog("[FlowistAssetCompression] WebViewAssetHandler class not found — skipping swizzle.")
            return
        }

        let original = Selector(("webView:startURLSchemeTask:"))
        let replacement = #selector(FlowistAssetCompression.flowist_webView(_:startURLSchemeTask:))

        guard
            let originalMethod = class_getInstanceMethod(handlerClass, original),
            let replacementMethod = class_getInstanceMethod(FlowistAssetCompression.self, replacement)
        else {
            NSLog("[FlowistAssetCompression] Method lookup failed — skipping swizzle.")
            return
        }

        // Add our IMP onto the target class, then exchange with the original.
        let added = class_addMethod(
            handlerClass,
            replacement,
            method_getImplementation(replacementMethod),
            method_getTypeEncoding(replacementMethod)
        )
        if added {
            if let newMethod = class_getInstanceMethod(handlerClass, replacement) {
                method_exchangeImplementations(originalMethod, newMethod)
                NSLog("[FlowistAssetCompression] Installed compressed asset handler.")
            }
        } else {
            NSLog("[FlowistAssetCompression] class_addMethod failed.")
        }
    }

    // Replacement IMP. After swizzling `self` is the Capacitor asset handler
    // instance; calling the same selector on `self` invokes the ORIGINAL IMP.
    @objc dynamic func flowist_webView(_ webView: WKWebView,
                                       startURLSchemeTask urlSchemeTask: WKURLSchemeTask) {
        let request = urlSchemeTask.request
        guard
            let url = request.url,
            let bundlePath = FlowistAssetCompression.bundleFilePath(for: url)
        else {
            // Fall through to original implementation.
            self.perform(#selector(FlowistAssetCompression.flowist_webView(_:startURLSchemeTask:)),
                         with: webView, with: urlSchemeTask)
            return
        }

        let accept = (request.value(forHTTPHeaderField: "Accept-Encoding") ?? "").lowercased()
        let fm = FileManager.default

        var chosenPath = bundlePath
        var encoding: String? = nil

        if accept.contains("br"), fm.fileExists(atPath: bundlePath + ".br") {
            chosenPath = bundlePath + ".br"
            encoding = "br"
        } else if accept.contains("gzip"), fm.fileExists(atPath: bundlePath + ".gz") {
            chosenPath = bundlePath + ".gz"
            encoding = "gzip"
        }

        guard let data = try? Data(contentsOf: URL(fileURLWithPath: chosenPath)) else {
            // Fall through to original implementation on read failure.
            self.perform(#selector(FlowistAssetCompression.flowist_webView(_:startURLSchemeTask:)),
                         with: webView, with: urlSchemeTask)
            return
        }

        var headers: [String: String] = [
            "Content-Type":   FlowistAssetCompression.mimeType(for: bundlePath),
            "Content-Length": "\(data.count)",
            "Access-Control-Allow-Origin": "*",
        ]
        if let encoding {
            headers["Content-Encoding"] = encoding
            headers["Vary"] = "Accept-Encoding"
        }
        // Fingerprinted files (`name-<8+hex>.ext`) never change → immutable.
        if FlowistAssetCompression.isFingerprinted(url: url) {
            headers["Cache-Control"] = "public, max-age=31536000, immutable"
        } else {
            headers["Cache-Control"] = "public, max-age=300"
        }

        guard
            let response = HTTPURLResponse(url: url,
                                           statusCode: 200,
                                           httpVersion: "HTTP/1.1",
                                           headerFields: headers)
        else {
            self.perform(#selector(FlowistAssetCompression.flowist_webView(_:startURLSchemeTask:)),
                         with: webView, with: urlSchemeTask)
            return
        }

        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    // MARK: - Helpers

    /// Maps a `capacitor://localhost/foo.js` URL to the on-disk path inside
    /// the app bundle's `public/` directory (where Capacitor stages `dist/`).
    private static func bundleFilePath(for url: URL) -> String? {
        guard let publicRoot = Bundle.main.url(forResource: "public", withExtension: nil) else {
            return nil
        }
        var relative = url.path
        if relative.hasPrefix("/") { relative.removeFirst() }
        if relative.isEmpty { relative = "index.html" }
        let full = publicRoot.appendingPathComponent(relative).path
        return FileManager.default.fileExists(atPath: full) ? full : nil
    }

    /// Matches Vite's default fingerprint pattern (`-` + 8+ hex chars before ext).
    private static let fingerprintRegex: NSRegularExpression? = {
        try? NSRegularExpression(pattern: "-[A-Za-z0-9_]{8,}\\.[a-z0-9]+$", options: [])
    }()

    private static func isFingerprinted(url: URL) -> Bool {
        guard let regex = fingerprintRegex else { return false }
        let last = url.lastPathComponent as NSString
        return regex.firstMatch(in: last as String, range: NSRange(location: 0, length: last.length)) != nil
    }

    private static func mimeType(for path: String) -> String {
        switch (path as NSString).pathExtension.lowercased() {
        case "js", "mjs":         return "application/javascript; charset=utf-8"
        case "css":               return "text/css; charset=utf-8"
        case "html", "htm":       return "text/html; charset=utf-8"
        case "json":              return "application/json; charset=utf-8"
        case "svg":               return "image/svg+xml"
        case "wasm":              return "application/wasm"
        case "woff":              return "font/woff"
        case "woff2":             return "font/woff2"
        case "ttf":               return "font/ttf"
        case "map":               return "application/json"
        case "png":               return "image/png"
        case "jpg", "jpeg":       return "image/jpeg"
        case "webp":              return "image/webp"
        case "avif":              return "image/avif"
        case "ico":               return "image/x-icon"
        case "txt":               return "text/plain; charset=utf-8"
        default:                  return "application/octet-stream"
        }
    }
}
