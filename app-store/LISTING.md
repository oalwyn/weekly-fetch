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
| **Privacy Policy URL** | https://theweekendfetch.com/privacy.html |
| **Support URL** | https://github.com/oalwyn/weekly-fetch/issues |
| **Marketing URL** (optional) | https://theweekendfetch.com/ |
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

## What's New

**1.1** (accounts and groups):

```
Plan weekends with your people.
• Sign in with Apple or with your email to start a group for your household or friends.
• Invite people with a link, a 6-letter code or a QR code. Invite links open the app.
• Be in several groups and switch between them.
• Already sharing a plan? Move it into a group in one tap, stars and all.
• Browsing still needs no account, and you can delete your account any time.
```

**1.0.1:** the app now gets its twice-weekly event updates from our new home, theweekendfetch.com.

---

## Screenshots

Upload the five files in `app-store/screenshots-6.3/` (1206 × 2622, no transparency) under **iPhone with Dynamic Island (medium display)**. App Store Connect only shows this section when the window is wide. The 1320 × 2868 originals in `app-store/screenshots/` were rejected there as "invalid dimensions". In this order:

1. `1-events.png`: this weekend's events
2. `2-map.png`: the map
3. `3-plans.png`: Our Weekend Plans with locked-in days
4. `4-plan-detail.png`: a plan with "Add to Calendar"
5. `5-add-to-calendar.png`: the filled-in calendar event

Apple scales these down for smaller iPhones automatically.

---

## App Privacy ("nutrition label")

Answers for **version 1.1** (accounts, groups, usage counts). Update the published answers **before submitting 1.1**; 1.0/1.0.1 used the shorter list at the bottom.

**Do you or your third-party partners collect data from this app?** Yes

| Data type | Used for | Linked to the user? | Tracking? | What it is |
|---|---|---|---|---|
| Contact Info → **Email Address** | App Functionality | Yes | No | Email sign-in codes (or the address Apple provides with Sign in with Apple) |
| Contact Info → **Name** | App Functionality | Yes | No | The first name shown to group members |
| User Content → **Other User Content** | App Functionality | Yes | No | Stars, locked-in days and group names |
| Identifiers → **User ID** | App Functionality, Analytics | Yes | No | The account identifier |
| Identifiers → **Device ID** | Analytics | **No** | No | A random code created on the device, used only for signed-out usage counts (not the advertising identifier) |
| Usage Data → **Product Interaction** | Analytics | Yes | No | Usage counts (app opens, stars, locks, invites, "More info"/"Directions" taps). Linked when signed in |
| Location | not collected | | | GPS stays on the phone. A typed home address goes to OpenStreetMap's lookup in real time and isn't stored (Apple's "optional disclosure" case). To be cautious, declare *Coarse Location → App Functionality, not linked, no tracking* |
| Everything else (contacts, diagnostics, purchases, browsing history…) | not collected | | | |

**Tracking:** No. The app doesn't track people across other companies' apps or websites, and has no ad networks.

<details><summary>1.0 / 1.0.1 answers (published Nov 11, 2026)</summary>

Name (App Functionality, linked, no tracking) and Other User Content (App Functionality, linked, no tracking). Nothing else.
</details>

---

## Age Rating

Answer **None** to every content question, and **No** to "Unrestricted Web Access" (links open in Safari, not inside the app), gambling and contests. Expected result: **4+**.

One judgment call: a few listings mention wine walks or beer festivals. If you want to be strict, answer "Infrequent/Mild" for *Alcohol, Tobacco, or Drug Use or References*. That gives a 12+ rating. Either answer is defensible.

---

## App Review Information

**Sign-in required:** leave **unticked**. Everything except shared group plans works without an account, and reviewers can create an account themselves with Sign in with Apple or any email address (the 6-digit code arrives by email). If Apple asks for a demo account anyway, create one with an email inbox you control and paste its address here.

**Contact:** your name, phone number and email. Only Apple's review team sees these.

**Notes for 1.1** (paste into the "Notes" box):

```
Thank you for reviewing The Bay Area Weekend Fetch 1.1.

Browsing events needs no account. Accounts are optional and only used to plan weekends with a group.

WHAT'S NEW IN 1.1: ACCOUNTS AND GROUPS
- Sign in on the "Our Weekend Plans" tab with Sign in with Apple, or with any email address (we email a 6-digit code; no password).
- After choosing a first name, create a group (e.g. "Our household"). The invite screen shows a link, a 6-letter join code and a QR code; "Share invite" opens the iOS share sheet.
- Invite links (https://theweekendfetch.com/join/?c=CODE) open the app via universal links and join the group after sign-in.
- Group & account: rename, see members, make a new join code (owner), leave the group, sign out, and Delete my account (in-app account deletion, with confirmation).

NATIVE FEATURES TO TRY
1. Reminders: On the Events tab, star an event this weekend. Open "Our Weekend Plans", tap the event, then "Lock it in". The app asks for notification permission and schedules reminders for the evening before (7pm) and 2 hours before the start time.
2. Add to Calendar: On a locked-in plan, tap "Add to Calendar". iOS's own New Event screen opens, filled in.
3. Share sheet: In a group, tap "Invite someone", then "Share invite".
4. Location (optional): Tap the "Mountain View" home button and choose "Use my current location" to sort events by distance. The location is used only on the device.

DATA
Accounts, groups, stars and simple usage counts are stored in our Supabase database; sign-in emails are sent by Resend. No ads, no tracking. Privacy policy: https://theweekendfetch.com/privacy.html

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
