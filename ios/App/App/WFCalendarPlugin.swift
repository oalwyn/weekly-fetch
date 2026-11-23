import UIKit
import Capacitor
import EventKit
import EventKitUI
import AuthenticationServices

/// "Add to Calendar" for a locked-in plan: opens Apple's own New Event screen, already filled in,
/// so the person can check it and tap Add. On iOS 17+ this needs no calendar permission at all.
@objc(WFCalendarPlugin)
public class WFCalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "WFCalendarPlugin"
    public let jsName = "WFCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()
    private var pendingCall: CAPPluginCall?

    @objc func addEvent(_ call: CAPPluginCall) {
        guard let title = call.getString("title"), let startMs = call.getDouble("start") else {
            call.reject("Missing title or start time")
            return
        }
        let endMs = call.getDouble("end") ?? (startMs + 2 * 3600 * 1000)
        let allDay = call.getBool("allDay") ?? false

        let present = { [weak self] in
            DispatchQueue.main.async {
                guard let self = self, let host = self.bridge?.viewController else {
                    call.reject("No screen to show the calendar on")
                    return
                }
                let event = EKEvent(eventStore: self.store)
                event.title = title
                event.location = call.getString("location")
                event.notes = call.getString("notes")
                if let link = call.getString("url"), let url = URL(string: link) { event.url = url }
                event.isAllDay = allDay
                event.startDate = Date(timeIntervalSince1970: startMs / 1000)
                event.endDate = Date(timeIntervalSince1970: endMs / 1000)

                let editor = EKEventEditViewController()
                editor.eventStore = self.store
                editor.event = event
                editor.editViewDelegate = self
                self.pendingCall = call
                host.present(editor, animated: true)
            }
        }

        if #available(iOS 17.0, *) {
            present()
        } else {
            store.requestAccess(to: .event) { granted, _ in
                if granted { present() } else { call.reject("Calendar access was not allowed") }
            }
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true)
        pendingCall?.resolve(["saved": action == .saved])
        pendingCall = nil
    }
}

/// v1.1: native "Sign in with Apple". Returns Apple's identity token, which the web code hands to
/// Supabase (signInWithIdToken). The nonce passed in is the SHA-256 (hex) of a random value the web
/// code keeps; Supabase checks the token against the raw value.
@objc(WFAppleSignInPlugin)
public class WFAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "WFAppleSignInPlugin"
    public let jsName = "WFAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var pendingCall: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        if let nonce = call.getString("nonce") { request.nonce = nonce }
        pendingCall = call
        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            pendingCall?.reject("Apple didn't return a sign-in token")
            pendingCall = nil
            return
        }
        pendingCall?.resolve([
            "identityToken": token,
            "givenName": credential.fullName?.givenName ?? "",   // only sent the very first time
            "email": credential.email ?? "",
            // one-time code the server swaps for Apple's token, so deleting the account can revoke the sign-in (Apple's rule)
            "authorizationCode": credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        ])
        pendingCall = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        pendingCall?.reject(canceled ? "canceled" : error.localizedDescription, canceled ? "CANCELED" : "FAILED")
        pendingCall = nil
    }
}


/// "Share our weekend" → Instagram Stories (Meta's Sharing to Stories): the card goes on the pasteboard as the Story
/// background (with the event link as text, for Instagram's Link sticker), then Instagram opens on its Story editor.
/// The person edits and posts there; nothing is posted for them. Needs the Facebook App ID and
/// LSApplicationQueriesSchemes "instagram-stories" in Info.plist.
@objc(WFInstagramPlugin)
public class WFInstagramPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WFInstagramPlugin"
    public let jsName = "WFInstagram"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareToStory", returnType: CAPPluginReturnPromise)
    ]

    private func storyURL(_ appId: String) -> URL? {
        return URL(string: "instagram-stories://share?source_application=" + appId)
    }

    @objc func available(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let ok = self.storyURL("0").map { UIApplication.shared.canOpenURL($0) } ?? false
            call.resolve(["available": ok])
        }
    }

    @objc func shareToStory(_ call: CAPPluginCall) {
        guard let appId = call.getString("appId"), !appId.isEmpty,
              let b64 = call.getString("image"), let data = Data(base64Encoded: b64),
              let url = storyURL(appId) else { call.reject("missing image or app id", "BAD_INPUT"); return }
        let link = call.getString("link") ?? ""
        DispatchQueue.main.async {
            guard UIApplication.shared.canOpenURL(url) else { call.reject("Instagram isn't installed", "NOT_INSTALLED"); return }
            var item: [String: Any] = ["com.instagram.sharedSticker.backgroundImage": data]
            if !link.isEmpty { item["public.utf8-plain-text"] = link }
            UIPasteboard.general.setItems([item], options: [.expirationDate: Date().addingTimeInterval(60 * 5)])
            UIApplication.shared.open(url, options: [:]) { ok in ok ? call.resolve(["opened": true]) : call.reject("couldn't open Instagram", "FAILED") }
        }
    }
}

/// The app's main screen: Capacitor's web view, plus the calendar and Sign in with Apple plugins above.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WFCalendarPlugin())
        bridge?.registerPluginInstance(WFAppleSignInPlugin())
        bridge?.registerPluginInstance(WFInstagramPlugin())
    }
}
