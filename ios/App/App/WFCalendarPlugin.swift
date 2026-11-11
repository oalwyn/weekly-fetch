import UIKit
import Capacitor
import EventKit
import EventKitUI

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

/// The app's main screen: Capacitor's web view, plus the calendar plugin above.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WFCalendarPlugin())
    }
}
