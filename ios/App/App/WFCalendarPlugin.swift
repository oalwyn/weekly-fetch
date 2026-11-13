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
            "email": credential.email ?? ""
        ])
        pendingCall = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        pendingCall?.reject(canceled ? "canceled" : error.localizedDescription, canceled ? "CANCELED" : "FAILED")
        pendingCall = nil
    }
}

/// The app's main screen: Capacitor's web view, plus the calendar and Sign in with Apple plugins above.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WFCalendarPlugin())
        bridge?.registerPluginInstance(WFAppleSignInPlugin())
    }
}
