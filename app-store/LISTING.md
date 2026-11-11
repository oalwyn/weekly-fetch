# App Store Connect: what to enter

Copy each block into the matching field in App Store Connect.

---

## App Information

| Field | Value |
|---|---|
| **Name** | The Bay Area Weekend Fetch |
| **Subtitle** | Events & shared weekend plans |
| **Bundle ID** | io.github.oalwyn.weekendfetch |
| **Primary category** | Lifestyle |
| **Secondary category** | Travel |
| **Content rights** | "No, it does not contain, show, or access third-party content." The listings are your own short summaries of public events, with links out. If you prefer to be cautious, answer Yes and confirm you have the right to use it. |
| **Privacy Policy URL** | https://oalwyn.github.io/weekly-fetch/privacy.html |
| **Support URL** | https://github.com/oalwyn/weekly-fetch/issues |
| **Marketing URL** (optional) | https://oalwyn.github.io/weekly-fetch/ |
| **Price** | Free |
| **Availability** | United States (the app only covers the Bay Area) |
| **Version** | 1.0 |
| **Copyright** | 2026 *your name* |

The home-screen name under the icon is **Bay Fetch**. That's set inside the app, not in App Store Connect.

---

## Promotional Text (170 characters max)

```
Holiday markets, tree lightings, dog-friendly outings and more, from Napa to Carmel. Star what looks good, lock in your weekend, and get a reminder before you go.
```

## Description

```
Get up, get out, go fetch the weekend.

The Bay Area Weekend Fetch is a hand-picked guide to what's on this weekend and the next two months, from Napa, Sonoma and Marin through San Francisco, the Peninsula and the South Bay, down to Santa Cruz, Monterey and Carmel.

FIND SOMETHING TO DO
• Holiday events, markets, concerts and shows, art, food and coffee
• Picks for young kids, teens and teen programs (with application deadlines)
• Dog-friendly events and dog walks, with notes on where dogs aren't allowed
• Browse by weekend or by date, filter by category and distance from home
• See everything on a map of the Bay Area coast

PLAN YOUR WEEKEND TOGETHER
• Star anything that looks fun. It lands in Our Weekend Plans.
• "Lock it in" for the day you'll actually go, and your weekend schedule builds itself.
• Start a shared plan and invite your household with one tap. Stars and plans sync across everyone's phones, with no account or sign-up.

NEVER MISS IT
• Reminders the evening before and two hours before each locked-in plan
• Add any plan to your calendar in one tap
• Directions and the organizer's page are always a tap away

FRESH EVERY WEEK
The event list is refreshed every Monday and Thursday morning, and the app picks up new events automatically.

No ads. No tracking. No account needed.
```

## Keywords (100 characters max, no spaces after commas)

```
events,weekend,things to do,san francisco,peninsula,south bay,marin,napa,dog friendly,markets,family
```

## What's New (for later versions; not needed for 1.0)

---

## Screenshots

Upload the five files in `app-store/screenshots/` under **iPhone 6.9" Display**. They're 1320 × 2868, the size Apple asks for. In this order:

1. `1-events.png`: this weekend's events
2. `2-map.png`: the map
3. `3-plans.png`: Our Weekend Plans with locked-in days
4. `4-plan-detail.png`: a plan with "Add to Calendar"
5. `5-add-to-calendar.png`: the filled-in calendar event

Apple scales these down for smaller iPhones automatically.

---

## App Privacy ("nutrition label")

**Do you or your third-party partners collect data from this app?** Yes

| Data type | Collected? | Used for | Linked to the user? | Used for tracking? |
|---|---|---|---|---|
| Contact Info → **Name** | Yes, only if they use shared plans (the first name they type) | App Functionality | Yes (cautious answer: it's shown to others on the list) | No |
| User Content → **Other User Content** | Yes, the events they star and lock in on a shared plan | App Functionality | Yes | No |
| Location | **No.** GPS location stays on the phone. A typed home address goes to OpenStreetMap's lookup in real time and isn't stored, which falls under Apple's "optional disclosure" rules. If you'd rather be cautious, declare *Coarse Location → App Functionality, not linked, no tracking*. | | | |
| Everything else (contacts, identifiers, usage data, diagnostics…) | No | | | |

**Tracking:** No. The app doesn't track people across other companies' apps or websites.

---

## Age Rating

Answer **None** to every content question, and **No** to "Unrestricted Web Access" (links open in Safari, not inside the app), gambling and contests. Expected result: **4+**.

One judgment call: a few listings mention wine walks or beer festivals. If you want to be strict, answer "Infrequent/Mild" for *Alcohol, Tobacco, or Drug Use or References*. That gives a 12+ rating. Either answer is defensible.

---

## App Review Information

**Sign-in required:** No (the app has no accounts).

**Contact:** your name, phone number and email. Only Apple's review team sees these.

**Notes** (paste into the "Notes" box):

```
Thank you for reviewing The Bay Area Weekend Fetch.

No sign-in is needed. Everything works right away.

WHAT THE APP DOES
A curated guide to Bay Area events (refreshed twice a week) with a shared weekend planner for households.

NATIVE FEATURES TO TRY
1. Reminders: On the Events tab, tap the star on any event this weekend. Open "Our Weekend Plans", tap the event, then tap "Lock it in". The app asks for notification permission and schedules reminders for the evening before (7pm) and 2 hours before the start time.
2. Add to Calendar: On a locked-in plan, tap "Add to Calendar". iOS's own New Event screen opens, already filled in with the title, place, date and time.
3. Shared plans and the share sheet: On "Our Weekend Plans", tap "Start our shared plans" and type any first name. Then tap "Invite someone to plan" to open the iOS share sheet with the invite link. Anyone who opens that link (in the app or on the website) joins the same plan, and stars and locked-in days sync between phones.
4. Location (optional): Tap the "Mountain View" home button and choose "Use my current location" to sort events by distance. The location is used only on the device.

DATA
There are no accounts. Shared plans store only a random list code, the first name the user types, and the events they starred, in our Supabase database. Privacy policy: https://oalwyn.github.io/weekly-fetch/privacy.html

Event links and directions open in Safari or Maps.
```

---

## Uploading the app (one time)

1. **Make the privacy page live.** It has to be reachable at the URL above before you submit. It goes live when the `ios-app` branch is merged into `main` and pushed.
2. **Open the project in Xcode:** in Terminal, in the project folder, run `npm run app:build`, then `npm run app:open`.
3. **Signing:** in Xcode, click **App** at the top of the left sidebar → the **App** target → **Signing & Capabilities**. Tick **Automatically manage signing** and choose your **Team** (your Apple developer account). Xcode registers the bundle ID for you.
4. **Create the app record:** at [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**. Choose iOS, name *The Bay Area Weekend Fetch*, primary language English (U.S.), bundle ID *io.github.oalwyn.weekendfetch*, and any SKU (e.g. `weekendfetch`).
5. **Archive:** in Xcode's top bar, set the device to **Any iOS Device (arm64)**, then choose **Product → Archive**. When the Organizer window opens, click **Distribute App → App Store Connect → Upload**.
6. **Try it on your own iPhone first (recommended):** after about 10–30 minutes the build appears in App Store Connect under **TestFlight**. Install Apple's TestFlight app on your iPhone and test it there.
7. **Fill in the listing** using this page, attach the build under **Build**, then click **Add for Review → Submit**.

Review usually takes 1–3 days. If Apple asks questions, they appear in App Store Connect under **App Review**.

### Each later update
Bump the version (e.g. 1.1) in Xcode under the App target → **General**, run `npm run app:build`, then repeat step 5. Event-list refreshes **don't** need an update: the app downloads the latest events itself.
