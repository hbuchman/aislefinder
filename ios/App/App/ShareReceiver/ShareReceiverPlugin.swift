import Foundation
import Capacitor

/// Reads text handed off by the ShareExtension target via the shared App
/// Group UserDefaults suite. JS polls getSharedText() on launch/resume,
/// since there's no push channel from an extension to an already-running
/// host app on iOS.
@objc(ShareReceiverPlugin)
public class ShareReceiverPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareReceiverPlugin"
    public let jsName = "ShareReceiver"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSharedText", returnType: CAPPluginReturnPromise)
    ]

    private static let appGroup = "group.com.aislefinder.app"
    private static let key = "pendingSharedText"

    @objc func getSharedText(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: ShareReceiverPlugin.appGroup)
        let text = defaults?.string(forKey: ShareReceiverPlugin.key) ?? ""
        defaults?.removeObject(forKey: ShareReceiverPlugin.key)
        call.resolve(["text": text])
    }
}
