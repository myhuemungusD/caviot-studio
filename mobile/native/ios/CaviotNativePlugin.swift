import Capacitor
import Foundation
import os

@objc(CaviotNativePlugin)
public class CaviotNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CaviotNativePlugin"
    public let jsName = "CaviotNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLaunchFlags", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "report", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
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
