# Google Play Console: what to enter

Copy each block into the matching place in Play Console (play.google.com/console).
Developer account: **organization**, Alwyn Ventures LLC (D-U-N-S number from the Apple enrollment).

---

## Create app

| Field | Value |
|---|---|
| **App name** (30 max) | The Weekend Fetch |
| **Default language** | English (United States) – en-US |
| **App or game** | App |
| **Free or paid** | Free |
| **Package name** | io.github.oalwyn.weekendfetch (set by the first upload; can never change) |

The name under the icon on the phone is **Weekend Fetch** (set inside the app).

---

## Main store listing

**Short description** (80 max)

```
Weekend events in the Bay Area, Sydney and London, with shared group plans.
```

**Full description** (4000 max)

```
Get up, get out, go fetch the weekend.

The Weekend Fetch is a hand-picked guide to what's on this weekend and the next two months, in three cities:
• The Bay Area: from Napa, Sonoma and Marin through San Francisco, the Peninsula and the South Bay, down to Santa Cruz, Monterey and Carmel.
• Sydney: from the Northern Beaches and the Harbour to Parramatta, the Blue Mountains, Wollongong and the Central Coast.
• London: from Central London out to Hackney, Greenwich, Richmond and Wimbledon, with day trips to Brighton, Oxford, Windsor, Cambridge and the Kent coast.
Switch city any time from the top of the screen.

WHAT'S ON
• Holiday events, markets, concerts and shows, art, food and coffee
• Sports games and new movies in theaters
• Free or ticketed at a glance, with a direct link to buy tickets
• Picks for young kids, teens and teen programs (with application deadlines)
• Dog-friendly events and dog walks
• Local small businesses with something on this weekend
• Community this weekend: group walks and runs, volunteering, cultural celebrations, talks and free museum days
• Browse by weekend or by date, filter by category and distance from home, or search

EXPLORE
• See everything on a map, this weekend or further ahead

RAINY DAY
• The weekend rain forecast for your area, indoor events, and museums, play spaces and cozy spots nearby

OUR PLANS, TOGETHER
• Star anything that looks fun, then "Lock it in" for the day you'll actually go.
• Start a group for your household or friends and invite them with a link. Stars, locked-in days, who's going and meet-up times sync across everyone's phones.

NEVER MISS IT
• Reminders the evening before and two hours before each locked-in plan
• Add any plan to your calendar in one tap
• Directions and the organizer's page are always a tap away

FRESH EVERY WEEK
The event list is refreshed every week, and the app picks up new events automatically.

No ads. Browsing needs no account.
```

**Graphics** (files in this folder)

| Asset | File |
|---|---|
| App icon 512×512 | `icon-512.png` |
| Feature graphic 1024×500 | `feature-graphic.png` |
| Phone screenshots (2–8, must be 9:16) | `screenshots-9x16/` (1080×1920, cropped from `screenshots/`) |

**Category**: Travel & Local (or Lifestyle). **Tags**: Events, Local guides, Family.
**Contact details**: email support@cazavera.com, website https://theweekendfetch.com/
**Privacy policy**: https://theweekendfetch.com/privacy.html

---

## App content (Policy → App content)

**Privacy policy**: https://theweekendfetch.com/privacy.html

**Ads**: No, the app doesn't contain ads.

**Sign in details** (was "App access"): **Yes, part of the app is restricted** (group plans). Reviewers can't receive email codes, so the review account `review@theweekendfetch.com` signs in with a password instead (accounts.js `REVIEW_EMAIL`). The account is in Supabase Auth; its password is only in `android/keystore/review-account.txt` (gitignored) and in Play Console.

**Content rating** (IARC questionnaire): category **All other app types**. Answer No to violence, sexuality, language, controlled substances, gambling. "Can users interact or exchange content?" **Yes**, limited: members of a group they joined by invite see each other's first names and starred events (no chat, no photos, no public profiles). "Shares user's current location with other users?" No. "Allows users to purchase digital goods?" No.

**Target audience**: **18 and over** (the app is for adults planning outings, including with kids; choosing under-18 ages brings the Families policy). Appeals to children: No.

**News app**: No. **Government app**: No. **Financial features**: none. **Health**: none.

**Data safety** (what the app collects; "collected" = sent off the phone):

| Data type | Collected | Shared | Optional? | Purpose | Notes |
|---|---|---|---|---|---|
| Personal info → Email address | Yes | No | Optional | Account management | Only if you sign in |
| Personal info → Name | Yes | No | Optional | App functionality | First name you choose, shown to your group |
| Personal info → User IDs | Yes | No | Optional | Account management, App functionality | Account identifier when signed in |
| Location → Approximate location | Yes | No | Optional | App functionality | Home location rounded to ~10 km, sent to Open-Meteo for the rain forecast; processed ephemerally, not stored by us |
| App activity → App interactions | Yes | No | Required | Analytics, App functionality | Usage records described in the privacy policy |
| App activity → Other user-generated content | Yes | No | Optional | App functionality | Starred and locked-in plans, meet-up time/place |
| Device or other IDs | Yes | No | Required | Analytics | Random device code for usage records |

- Data encrypted in transit: **Yes**
- Users can request deletion: **Yes**. In-app: Our Plans → Group & account → Delete my account. **Delete account URL**: https://theweekendfetch.com/privacy.html#delete
- Not collected: precise location, contacts, photos, files, calendar, health, financial info, messages, web browsing history.
- Service providers (Supabase, Resend, Open-Meteo) process data for us: under Google's definitions that is **not "sharing"**.

**Permissions the app declares**: Internet, notifications (plan reminders), run at startup (re-schedules reminders after a restart), wake lock. No exact alarms, no location permission (home is picked on the map or typed), no calendar permission (Add to Calendar opens the calendar app).

---

## Releases

- Upload key: `android/keystore/upload.jks` on the owner's Mac only (gitignored; password in `android/keystore.properties`, also gitignored). Back both up in the password manager: losing the upload key means asking Google to reset it.
- Google Play App Signing: on (default). After the first upload, copy the **App signing key certificate SHA-256** from Play Console → Setup → App integrity into `/.well-known/assetlinks.json` so invite links open the app.
- Build: `npm run android:release` → `android/app/build/outputs/bundle/release/app-release.aab`.
- Each new release: raise `versionCode` (and `versionName`) in `android/app/build.gradle`.

## Release notes (1.0)

```
First Android release: what's on this weekend in the Bay Area and Sydney, a map, rainy-day ideas, and shared weekend plans with reminders.
```

## Release notes (1.4.1, versionCode 2; sent Nov 20, 2026)

```
More ways to get out and meet your neighbors.
• Community this weekend: things to join in, ways to volunteer, cultural celebrations, talks and free museum days.
• New Rainy Day tab, Shop local picks, search, and tidier weekends.
• Labels for who an event suits, kids' camp and youth sports sign-ups, and the East Bay on the map.
```

## Release notes (1.5, versionCode 3; Play allows 500 characters)

```
Now in London too.
• London Weekend Fetch: what's on across London, plus day trips to Brighton, Oxford, Cambridge and the Kent coast. Tap the city at the top to switch between the Bay Area, Sydney and London.
• London's map, Rainy Day ideas and dog walks.
• Community boxes and free museum days in every city.
• Distances start from the city centre until you set your home (tap Set home).
```

## Release notes (1.6, versionCode 4; Play allows 500 characters)

```
Bring someone along.
• Invite someone: an Invite button on every upcoming event writes a short message and opens your share sheet.
• Share our weekend: pick one photo after a plan and get a Story-size card. Your photo stays on your phone.
• First date ideas: date-friendly events and places, checked on the organiser's page.
```


## Data safety changes for the next release (settings saved to the account, v1.7)
- Location → **Approximate location**: collected, not shared, optional, purpose App functionality (home area rounded to about 1 km, only when signed in).
- Personal info → **Email address**: add purpose **Developer communications / Marketing** (optional opt-in).
- App activity → **Other user-generated content**: saved settings.
