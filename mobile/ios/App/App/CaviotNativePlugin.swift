import Capacitor
import Foundation
import os
import StoreKit

@objc(CaviotNativePlugin)
public class CaviotNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CaviotNativePlugin"
    public let jsName = "CaviotNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLaunchFlags", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "report", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "proStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "proProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "proPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "proRestore", returnType: CAPPluginReturnPromise)
    ]

    // Files opened in Caviot from Files or the share sheet ("Open in Caviot"). SceneDelegate hands the
    // URLs over; they are copied into tmp so the web view can read them after the security scope ends.
    static let templateFileNotification = Notification.Name("CaviotTemplateFileReady")
    private static var pendingFiles: [[String: String]] = []
    private static let pendingLock = NSLock()
    private static let maxTemplateBytes: Int64 = 100 * 1024 * 1024

    public static func receive(_ urls: [URL]) {
        var added = false
        for url in urls where url.isFileURL {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let size = (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize).map { Int64($0) } ?? 0
                if size > maxTemplateBytes { NSLog("CAVIOT open: %@ is larger than 100 MB", url.lastPathComponent); continue }
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent("caviot-open", isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let target = directory.appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
                try FileManager.default.copyItem(at: url, to: target)
                pendingLock.lock()
                pendingFiles.append(["path": target.path, "name": url.lastPathComponent])
                pendingLock.unlock()
                added = true
            } catch {
                NSLog("CAVIOT open: could not read %@: %@", url.lastPathComponent, error.localizedDescription)
            }
        }
        if added { NotificationCenter.default.post(name: templateFileNotification, object: nil) }
    }

    @objc func takePendingFiles(_ call: CAPPluginCall) {
        CaviotNativePlugin.pendingLock.lock()
        let files = CaviotNativePlugin.pendingFiles
        CaviotNativePlugin.pendingFiles.removeAll()
        CaviotNativePlugin.pendingLock.unlock()
        call.resolve(["files": files])
    }

    @objc func onTemplateFileReady() {
        notifyListeners("templateFileReady", data: [:])
    }

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onTemplateFileReady),
            name: CaviotNativePlugin.templateFileNotification,
            object: nil
        )
        // Written before the web view runs, so a failed page still leaves a launch line for CI.
        if ProcessInfo.processInfo.arguments.contains("-CaviotSmoke") {
            let memory = os_proc_available_memory()
            let physical = ProcessInfo.processInfo.physicalMemory
            let json = "{\"stage\":\"launch\",\"availableMemory\":\(memory),\"physicalMemory\":\(physical),\"native\":true}"
            try? appendSmokeLine(json)
            NSLog("CAVIOT_SMOKE %@", json)
        }
        listenForProTransactions()
    }

    @objc func onMemoryWarning() {
        notifyListeners("memoryWarning", data: [:])
    }

    @objc func getLaunchFlags(_ call: CAPPluginCall) {
        let arguments = ProcessInfo.processInfo.arguments
        call.resolve([
            "smoke": arguments.contains("-CaviotSmoke"),
            "availableMemory": NSNumber(value: os_proc_available_memory()),
            "physicalMemory": NSNumber(value: ProcessInfo.processInfo.physicalMemory)
        ])
    }

    // Simulator smoke test only. The path is fixed; JavaScript cannot choose it.
    @objc func report(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), json.count < 8000, json.first == "{", json.last == "}" else {
            call.reject("Smoke report was empty or not a single JSON object")
            return
        }
        do {
            try appendSmokeLine(json)
            NSLog("CAVIOT_SMOKE %@", json)
            call.resolve()
        } catch {
            call.reject("Could not write the smoke report", nil, error)
        }
    }

    private func appendSmokeLine(_ json: String) throws {
        let directory = try FileManager.default.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let url = directory.appendingPathComponent("caviot-smoke.json")
        let line = json + "\n"
        if FileManager.default.fileExists(atPath: url.path) {
            let handle = try FileHandle(forWritingTo: url)
            defer { try? handle.close() }
            try handle.seekToEnd()
            if let data = line.data(using: .utf8) { try handle.write(contentsOf: data) }
            try handle.synchronize()
        } else {
            try Data(line.utf8).write(to: url, options: .atomic)
        }
    }

    // MARK: - Caviot Studio Pro (one-time In-App Purchase, StoreKit 2)
    // Everything is checked on this device with StoreKit 2's signed transactions: no server, no account,
    // no third-party SDK, and nothing leaves the device, so the privacy label stays "Data Not Collected".
    // Transaction.currentEntitlements is cached by iOS, so a bought unlock still works offline.
    static let proProductId = "com.caviot.studio.pro"
    private var proUpdates: Task<Void, Never>?
    private var proProductCache: Product?

    // "production" for App Store builds, "sandbox" for TestFlight and App Review, "development" for
    // Xcode and simulator builds. The web side only relaxes the paywall outside production, and only
    // while the product is not set up in App Store Connect yet.
    static func storeEnvironment() -> String {
        #if DEBUG || targetEnvironment(simulator)
        return "development"
        #else
        if Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt" { return "sandbox" }
        return "production"
        #endif
    }

    static func ownsPro() async -> Bool {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if transaction.productID == proProductId && transaction.revocationDate == nil { return true }
        }
        return false
    }

    static func storeErrorCode(_ error: Error) -> String {
        if let storeError = error as? StoreKitError {
            switch storeError {
            case .networkError: return "offline"
            case .userCancelled: return "cancelled"
            case .notAvailableInStorefront: return "not-available"
            case .notEntitled: return "not-entitled"
            default: return "store"
            }
        }
        if let purchaseError = error as? Product.PurchaseError {
            switch purchaseError {
            case .purchaseNotAllowed: return "not-allowed"
            case .productUnavailable: return "not-available"
            default: return "store"
            }
        }
        if (error as NSError).domain == NSURLErrorDomain { return "offline" }
        return "store"
    }

    private func listenForProTransactions() {
        guard proUpdates == nil else { return }
        // Purchases finished outside the paywall (Ask to Buy approval, a refund, Family Sharing, another device).
        proUpdates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                guard transaction.productID == CaviotNativePlugin.proProductId else { continue }
                await transaction.finish()
                let owned = await CaviotNativePlugin.ownsPro()
                self?.notifyListeners("proChanged", data: ["pro": owned])
            }
        }
    }

    private func loadProProduct() async throws -> Product? {
        if let cached = proProductCache { return cached }
        let product = try await Product.products(for: [CaviotNativePlugin.proProductId]).first
        proProductCache = product
        return product
    }

    @objc func proStatus(_ call: CAPPluginCall) {
        Task {
            let owned = await CaviotNativePlugin.ownsPro()
            call.resolve([
                "pro": owned,
                "environment": CaviotNativePlugin.storeEnvironment(),
                "productId": CaviotNativePlugin.proProductId
            ])
        }
    }

    @objc func proProduct(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await self.loadProProduct() else {
                    call.resolve([
                        "available": false,
                        "reason": "not-found",
                        "environment": CaviotNativePlugin.storeEnvironment()
                    ])
                    return
                }
                call.resolve([
                    "available": true,
                    "productId": product.id,
                    "displayName": product.displayName,
                    "description": product.description,
                    "displayPrice": product.displayPrice,
                    "familyShareable": product.isFamilyShareable,
                    "environment": CaviotNativePlugin.storeEnvironment()
                ])
            } catch {
                call.reject(error.localizedDescription, CaviotNativePlugin.storeErrorCode(error), error)
            }
        }
    }

    @objc func proPurchase(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await self.loadProProduct() else {
                    call.reject("Caviot Studio Pro is not available in the App Store yet.", "not-found")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve(["status": "purchased", "pro": transaction.revocationDate == nil])
                    case .unverified:
                        call.reject("The App Store could not verify this purchase.", "unverified")
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled", "pro": false])
                case .pending:
                    // Ask to Buy or a payment that needs more steps; Transaction.updates reports the result later.
                    call.resolve(["status": "pending", "pro": false])
                @unknown default:
                    call.resolve(["status": "unknown", "pro": await CaviotNativePlugin.ownsPro()])
                }
            } catch {
                let code = CaviotNativePlugin.storeErrorCode(error)
                if code == "cancelled" {
                    call.resolve(["status": "cancelled", "pro": false])
                } else {
                    call.reject(error.localizedDescription, code, error)
                }
            }
        }
    }

    @objc func proRestore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                let code = CaviotNativePlugin.storeErrorCode(error)
                if code == "cancelled" {
                    call.resolve(["status": "cancelled", "pro": await CaviotNativePlugin.ownsPro()])
                    return
                }
                // Offline: the entitlements iOS already has are still checked below.
                if code != "offline" {
                    call.reject(error.localizedDescription, code, error)
                    return
                }
                let owned = await CaviotNativePlugin.ownsPro()
                if owned {
                    call.resolve(["status": "restored", "pro": true])
                } else {
                    call.reject(error.localizedDescription, code, error)
                }
                return
            }
            let owned = await CaviotNativePlugin.ownsPro()
            call.resolve(["status": owned ? "restored" : "none", "pro": owned])
        }
    }
}
