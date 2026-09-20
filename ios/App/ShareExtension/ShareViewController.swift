import UIKit
import MobileCoreServices
import UniformTypeIdentifiers

/// No-UI share extension: grabs the shared plain text (or URL as a fallback),
/// hands it to the host app via the shared App Group UserDefaults suite, and
/// completes immediately so the user never sees an intermediate screen.
class ShareViewController: UIViewController {

    private static let appGroup = "group.com.aislefinder.app"
    private static let key = "pendingSharedText"

    override func viewDidLoad() {
        super.viewDidLoad()
        extractSharedText { [weak self] text in
            if let text = text, !text.isEmpty {
                let defaults = UserDefaults(suiteName: ShareViewController.appGroup)
                defaults?.set(text, forKey: ShareViewController.key)
            }
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    private func extractSharedText(completion: @escaping (String?) -> Void) {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let provider = item.attachments?.first
        else {
            completion(nil)
            return
        }

        let textType = UTType.plainText.identifier
        let urlType = UTType.url.identifier

        if provider.hasItemConformingToTypeIdentifier(textType) {
            provider.loadItem(forTypeIdentifier: textType, options: nil) { data, _ in
                completion((data as? String))
            }
        } else if provider.hasItemConformingToTypeIdentifier(urlType) {
            provider.loadItem(forTypeIdentifier: urlType, options: nil) { data, _ in
                completion((data as? URL)?.absoluteString)
            }
        } else {
            completion(nil)
        }
    }
}
