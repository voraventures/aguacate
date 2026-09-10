// Read-only, bounded Zoom AX adapter. No screen capture, clicks, or keystrokes.
// Semantic labels must be qualified against supported Zoom builds before release.
import Cocoa
import ApplicationServices

func value(_ element: AXUIElement, _ attribute: String) -> AnyObject? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &result) == .success else { return nil }
    return result
}
func scan(_ root: AXUIElement, includeNames: Bool) -> ([String: String], String?) {
    var queue = [root], visited = 0, people: [String: String] = [:], meetingURL: String?
    while !queue.isEmpty && visited < 1500 {
        let item = queue.removeFirst(); visited += 1
        let identifier = value(item, kAXIdentifierAttribute) as? String ?? ""
        let description = includeNames ? (value(item, kAXDescriptionAttribute) as? String ?? "") : ""
        // Only explicit active-speaker semantics; never infer from selection/focus.
        if includeNames, identifier.hasPrefix("participant_"), description.hasPrefix("Active speaker: ") {
            let name = String(description.dropFirst("Active speaker: ".count))
            if !name.isEmpty && name.count <= 120 && identifier.count <= 128 { people[identifier] = name }
        }
        if identifier == "meeting_id", let number = value(item, kAXValueAttribute) as? String {
            let digits = number.filter { $0.isNumber }
            if (9...11).contains(digits.count) { meetingURL = "https://zoom.us/j/" + digits }
        }
        if let children = value(item, kAXChildrenAttribute) as? [AXUIElement] { queue.append(contentsOf: children.prefix(200)) }
    }
    return (people, meetingURL)
}
func reply(_ object: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) { print(line); fflush(stdout) }
}
while let line = readLine() {
    guard line.hasPrefix("scan:zoom.") || line == "offer" else { continue }
    guard AXIsProcessTrusted() else { reply(["status": "permission_required", "windows": []]); continue }
    var windows: [[String: Any]] = []
    for app in NSRunningApplication.runningApplications(withBundleIdentifier: "us.zoom.xos") {
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 0.2)
        for window in (value(root, kAXWindowsAttribute) as? [AXUIElement] ?? []).prefix(8) {
            // Require an explicit meeting window identifier; unknown layouts abstain.
            let identifier = value(window, kAXIdentifierAttribute) as? String ?? ""
            guard identifier.lowercased().contains("meeting") else { continue }
            let target = "zoom.\(app.processIdentifier).\(CFHash(window))"
            guard line == "offer" || line == "scan:" + target else { continue }
            let (people, url) = scan(window, includeNames: line != "offer")
            var row: [String: Any] = ["target": target, "participants": people.map { ["id": $0.key, "name": $0.value] }]
            if let url = url { row["url"] = url }
            windows.append(row)
        }
    }
    reply(["status": windows.isEmpty ? "unavailable" : "experimental", "windows": windows, "observed_at": Date().timeIntervalSince1970])
}
