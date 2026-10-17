import Capacitor
import Foundation
import os

@objc(CaviotNativePlugin)
public class CaviotNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CaviotNativePlugin"
    public let jsName = "CaviotNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLaunchFlags", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "report", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingFiles", returnType: CAPPluginReturnPromise)
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
}
