# The Bay Area Weekend Fetch: handoff notes

This is the project brief for Claude. Read it before changing anything.

## What this is
A mobile-first events site for a household in Mountain View, CA (with a dog), shared with other households.
It covers the North Bay (Marin, Napa, Sonoma, Santa Rosa), SF, the Peninsula, the South Bay, Santa Cruz, Monterey and Carmel.

- Live: https://theweekendfetch.com/ (GitHub Pages custom domain since Nov 13, 2026; `CNAME` file in repo root; DNS at Porkbun: 4 A + 4 AAAA records to GitHub Pages, `www` CNAME to oalwyn.github.io, Porkbun email-forwarding MX kept). The old https://oalwyn.github.io/weekly-fetch/ address 301-redirects here, but that redirect has no CORS header, so cross-site `fetch()` through the old address fails: always use the new domain in code.
- Tabs (renamed Nov 16, 2026): **What's On** (events by weekend or by date, with a Filter panel; was "Events"), **Explore** (the map: custom SVG coastline with pins; was "Map"), and **Our Plans** (shared starred list, locked into specific days; was "Our Weekend Plans"; app 1.3 and older still show the old names, and privacy.html mentions both).
- Tab, search and home icons: Gregor Cresnar line icons from Noun Project (owner's Noun Pro plan, royalty-free, no credit needed), saved in `src/icons/` and inlined as SVG with `fill="currentColor"` so CSS colours them. Keep any new icons in the same style (his "softline" sets, 48-unit stroke). Since Nov 16 there are also category icons (card labels, Filter chips, Holiday/Markets/Dog-friendly buttons, market and movie boxes), a location pin (distances, city button, meet-ups) and a big star on empty Plans. They all live in `src/icons/paths.json`, which build.py injects as `WF_ICONS`; draw them with `wfIco(key)` (keys in `ICO_KEY` in app.js). Dog-friendly uses his older paw (no softline dog exists).
- Categories: `hol` holiday, `mkt` markets, `dog`, `food` pizza & coffee, `art`, `show` concerts & shows, `kids` young kids, `teen`, `prog` programs & sign-ups (deadlines: teen programs, kids' camps, youth sports), `join` join in, `vol` volunteer, `cult` cultural celebrations, `learn` talks & learning, `fmd` free museum days, `evt`, plus `walk` dog walks.

## Files
| Path | Role |
|---|---|
| `index.html` | **Built file, do not hand-edit.** Rebuild with `python3 src/build.py`. |
| `data.js` | Event data (`window.WF_DATA = {updated, sections, items}`). Rewritten twice a week by a scheduled Claude task (see below). Source of truth for events. |
| `walks.js` | Dog walks (`window.WF_WALKS = {items, nodogs}`), edited by hand. |
| `rainy.js`, `sydney/rainy.js` | Rainy Day venues (`window.WF_RAINY = {updated, items}`: `id, name, grp` museum/play/cozy/dog, `town, lat, lon, url, note, tags` kids/teens/dog/free, `price`), hand-researched Nov 16, 2026 with every url checked. The refresh routines don't touch it. |
| `src/app.js` | Main app: rendering, filters, weekends, map, plans, locks. |
| `src/gh_sync.js` | Shared list sync via Supabase (overrides `toggleStar`, `renderOurList`, `setPlan`, `toggleLock` from app.js). |
| `src/template_head.html`, `src/template_tail.html` | Page markup and all CSS. Mobile rules live in `@media (max-width:600px)`. |
| `src/coast.json` | Pre-generated coastline path and bbox `[36.45, 38.72, -123.12, -121.55]`. |
| `src/build.py`, `src/build_gh.py` | Build pipeline: inject coastline + app.js into the template, then apply the GitHub-site tweaks (manifest, PAGE_URL, gh_sync). |
| `src/sb.json` | Supabase URL + **publishable** key (public by design). |
| `src/tests/test_site.py` | Playwright smoke test with Supabase mocked (two simulated phones). |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png`, `icon.svg`, `banner.svg` | Home-screen app bits. Golden Gate sunset art; `?v=N` cache-busters in build_gh.py and the manifest. |
| `supabase-setup.sql` | Database schema and functions (already applied). |
| `.github/workflows/keepalive.yml` | Pings Supabase Mon/Thu so the free project doesn't pause. |

## Build and test
```
python3 src/build.py                     # rebuilds index.html
pip3 install playwright && python3 -m playwright install chromium   # once
python3 src/tests/test_site.py           # should print PASS
python3 -m http.server 8000              # then open http://localhost:8000 (phone width ~390px)
```
Always check changes at a 390px-wide viewport. Pushing to `main` deploys in about a minute.

## Data model (data.js items)
`n, id, sec, when, title, meta, cat, url, lat, lon, q, tbc`, plus dates in one of three forms: `start`/`end` (YYYY-MM-DD), or `dates[]`, or `days[]` with `start`/`end`.
`prog` items use `deadline` instead of dates and live in `sec: "programs"`.
- **`id` must never change for an existing event**: stars and locked-in plans are keyed by it.
- `meta` starts with the venue/town. `url` is only a real page that was actually seen; with no url the app falls back to a Google search.
- Sections: `week, late-nov, early-dec, mid-dec, jan, tbc, dog, food, programs, radar`.

## Shared list (Supabase, free tier)
- Project URL `https://halekjplfqkdteurtznv.supabase.co`, publishable key in `src/sb.json`. **Never ask for, accept, or commit the secret / service_role key.**
- Table `picks(list_code, item_id, who, item jsonb)`. RLS is on and table access is revoked; everything goes through security-definer RPCs: `get_picks`, `add_pick`, `remove_pick`, `ping`.
- A star is a row with `who` = the person's first name. A locked plan is a row with `who = "__lock__YYYY-MM-DD"` (the specific day). There is one lock per item, and the last unstar clears its locks.
- People join by the invite link `…/#list-<24-char code>`. The code stays in the address bar so iOS "Add to Home Screen" keeps it (home-screen storage is separate from Safari's). localStorage keys: `wf-list`, `wf-name`, `wf-queue` (offline ops), `wf-cache`, `wf-lcache`, `wf-home`, `wf-dist`, `wf-group`, `wf-view2`, `wf-vb2`.
- Sync polls every 20s and on tab focus.

## Scheduled refresh
A Claude Code cloud routine ("Bay Area Weekend Fetch refresh (Mondays, cloud)", id `trig_01MWa7xLMXTGeKADFvB6Nz3X`, Mondays 5:17am Pacific (weekly since Nov 15, 2026, to save credits; was Mon + Thu), https://claude.ai/code/routines/trig_01MWa7xLMXTGeKADFvB6Nz3X) runs in Anthropic's cloud with this repo attached as its source and no connectors. First successful run Nov 13, 2026. (The original routine, `trig_01QNAircTq1649aLoj2meAVz`, was created as a Cowork task with no repo or shell tools, so every fire was dropped before a session started; it is disabled.) It researches events and **rewrites only `data.js`**, then commits and pushes to `main`.
So always `git pull` before working, and don't hand-edit `data.js` in ways the refresh would undo. Its prompt can be changed from claude.ai if categories or regions change.

## Cities (Sydney Harbour Fetch in progress, Nov 14, 2026)
- One code base, one page per city. Settings: `src/cities/<key>.json` (brand, header, map coastline file, map views and labels, regions for reports, home, units mi/km, timezone, SEO text). `src/build.py` builds the Bay Area at the site root and each other city at `/<path>/` (only once `<path>/data.js` exists). Other cities' pages load shared files from the root, keep their own `data.js`/`walks.js`/`manifest.webmanifest`, get their own browser keys for city-specific settings (`/*city-storage*/` script), and show no App Store bar (the app is Bay Area only for now).
- Sydney: `/sydney/`, map `src/coast_sydney.json` built by `src/tools/make_coast.py` from OpenStreetMap coastline + harbour/river water areas (Overpass; Sydney Harbour isn't inside the coastline in OSM). Event ids start with `syd-`. Dog spots in `sydney/walks.js` (hand-made; confirm on council sites).
- Sydney refresh routine: "Sydney Harbour Fetch refresh (Mondays Sydney time, cloud)", id `trig_013PAaYNEY2nSUe6V53a1UXb`, Opus, Mondays 6:17am Sydney time (= Sunday ~11am Pacific, about 18 hours before the Bay Area run), writes only `sydney/data.js`.
- Farmers markets (Nov 15, 2026): both refresh prompts ask for weekly farmers markets as one `mkt` item per market with `dates[]` (Bay Area ids start `fm-`, 10–14 markets; Sydney 8–12). California certified markets don't allow dogs, which the meta says.
- Model trial: one-off Sonnet run of the Bay Area refresh (`trig_015qf7G1jAfS7XZ6yiVuHYTj`) pushes to branch `sonnet-trial` only; compare with Opus's next main refresh.
- City switch (public since Nov 14, 2026): "📍 <city> ▾" at the top of each city's header, from `src/build.py` `city_switch()` + `src/city_switch.js`, all wrapped in `<!--citysw-->` (build_app.py strips it; the app is Bay Area only until 1.3). Picking a city saves localStorage `wf-city` (site-wide, not namespaced); the site root redirects to that city unless the URL has a hash or query (invites, utm). Visitors whose time zone is in another city's area get a one-time "Looks like you're near …" bar (`wf-city-asked` after "No thanks"). Each city has its own banner (`banner` in its settings). Privacy policy has a Sydney/Australia section; /sydney/ is in the sitemap.
- New app icon "Sunny weekend" (`icon.svg`, website icons `?v=5`); `app-store/icon-1024-v1.3.png` goes into the app with 1.3 (name "The Weekend Fetch", home-screen "Weekend Fetch").
- Stats by city (live Nov 15, 2026): `supabase/v1.4-city.sql` (applied) adds `city` to analytics_events/analytics_weekly; the site sends `city` (CITY.key) on every record and in `p_ctx_json`; otherwise `_city_of()` works it out (syd- ids = sydney, iPhone app = bayarea). Existing records were tagged. `admin_report(p_weeks, p_city)` / `admin_export(..., p_city)`; the dashboard has a City filter and a "Cities" table. Re-run v1.4 after any re-run of v1.3 (v1.3 would otherwise bring back the one-argument admin_report). Reporting weeks stay Los Angeles weeks for every city.
- App 1.3 (build 8, Nov 15, 2026): city picker in the app. build_app.py now writes every city's page into app/www (Bay Area at the root, Sydney at app/www/sydney/), keeps the `<!--citysw-->` switch, and points its links at `/sydney/index.html` and `/index.html` (Capacitor serves the root index.html for any path without a file name). Each city downloads its own live data.js/walks.js (localStorage `wf-app-data`/`wf-app-walks`, Sydney `wf-app-data-sydney`/`wf-app-walks-sydney`). Home-screen name "Weekend Fetch", new icon. Submitted to App Review Nov 15, 2026 (automatic release); App Store name changed to "The Weekend Fetch" with it. Approved Nov 17, 2026. The same day: Australia added under Pricing and Availability, the App Store bar and Apple banner now show on the Sydney page too, and the JSON-LD app name is The Weekend Fetch.
- App 1.4 (build 9, Nov 17, 2026): brings the Nov 16 website changes into the app (Rainy Day tab, renamed tabs and icons, Local businesses, top picks, search). Submitted to App Review Nov 17 (automatic release); What's New, new description and promo text in `app-store/LISTING.md`. New screenshots (app-store/screenshots-1.4) went in with a resubmit. Build 10 (with the community boxes) was uploaded too, but App Store Connect was down (Apple outage Nov 17) so 1.4 stayed in review with build 9. 1.4 (build 9) was approved Nov 17, 2026. 1.4.1 (build 11, community boxes) uploaded Nov 17, 2026 with the App Store Connect API key (below) and submitted. Until then the apps show community events as plain "Other" cards.
- Fixed Nov 15, 2026: the Sydney page loaded its sign-in library from /sydney/vendor/ (404), so Sydney sign-in and groups were broken; build_gh.py now points it at /vendor/.

## Engagement measurement v1.3 (live since 2026-11-14T23:19:20Z = Nov 14, 3:19pm PT; pg_cron enabled, nightly retention job; the 3 existing accounts are admin + internal)
- Source of truth: `analytics_events` (`supabase/v1.3-analytics.sql`). Group plan changes are recorded by triggers on group_picks/locks/rsvps/members (server_confirmed, only on real change; context via the optional `p_ctx_json` argument the plan RPCs now take). Everything else goes through `log_client_event` (validated, rate-limited, de-duplicated by `record_id`; client_observed). `usage_events`/`log_event` are frozen for older app versions and not used in reports.
- Client logger: `track()` in accounts.js (session id, placement, category/region, environment, app version, first-record acquisition). Signed-in records never carry the device code (`wf-anon`); sign-in/out start a new session; sign-out rotates the device code (except devices marked internal).
- Order matters when deploying: apply the SQL before publishing site code that sends `p_ctx_json`, or group plans break.
- Owner dashboard: `/admin/` (generated from `src/admin.html` by build_gh.py); access via `analytics_admins`. Since Nov 20, 2026 it has a **Presentation (PowerPoint)** button: it pulls the latest `admin_report` for the chosen city/weeks and builds a 13-slide .pptx in the browser (`buildDeck` in admin.html; PptxGenJS 3.12.0 in `vendor/pptxgen-3.12.0.bundle.js`, loaded only on click and left out of the app builds): cover with last full week's numbers and change, people per week, meaningful actions + groups, platforms, key actions, cities, categories, regions, top events (titles from data.js), 7-day funnel, sources + platforms, activation/retention tables, definitions. Quick Look doesn't draw native charts; check them with python-pptx or open in Keynote/PowerPoint/Google Slides. Exclusions: `analytics_internal`, non-production environment (localhost, debug app builds; `npm run app:release` tags production).
- Tests: `npm run test:db` (incl. test_analytics.mjs), `src/tests/test_analytics_e2e.py`, `src/tests/test_event_ids.py`. Event-ID check: `python3 src/tools/event_ids.py check`.
- Any new event name must be added to the check constraint and the allowlist in log_client_event, and described in privacy.html.

## Engagement and search (Nov 14, 2026)
- Usage counts go to `usage_events` through the `log_event` RPC (accounts.js `logEvent`; links carry `data-k`/`data-ev`). Kinds added in `supabase/v1.2-usage.sql` (applied): outbound_tickets, outbound_showtimes, filter, interests, app_store. Report: `supabase/reports/engagement.sql` (run in Supabase SQL editor). Any new kind must be added to the check constraint first, and listed in privacy.html.
- Since Nov 20, 2026 the app bar picks the store per device (Android: Google Play; iPhone outside Safari: App Store; computers: both), the footer of every city page has "Get the free app: App Store · Google Play" (inside `<!--appbar-->`, so the app strips it), and JSON-LD lists both apps. Store taps stay `app_store_clicked`, told apart by `dest_host`. Play URL: https://play.google.com/store/apps/details?id=io.github.oalwyn.weekendfetch
- Website-only extras in build_gh.py: SEO meta/Open Graph/JSON-LD, the "Get the free iPhone app" bar (`<!--appbar-->`, stripped by build_app.py with the `apple-itunes-app` tag); since Nov 16, 2026 it is hidden on a first visit (localStorage `wf-visits`) and in iPhone Safari, which shows Apple's own banner). `robots.txt`, `sitemap.xml`, IndexNow key file `ededfd8e14023c622cfe6135cd6389ca.txt` (Bing etc.).
- Google Search Console and Bing Webmaster Tools verified Nov 14, 2026 by meta tags in build_gh.py (`google-site-verification`, `msvalidate.01`): never remove them. Sitemaps submitted to both.
- Google Analytics 4 (property "The Bay Area Weekend Fetch" 564352091 in the owner's GA account "Cazavera", measurement ID G-HS0P25R6JR), website only: `<!--ga-->` block in build_gh.py (stripped from the app by build_app.py). Google signals and ad personalization off; not loaded under GPC/Do Not Track. `logEvent` also sends each event to GA. Linked to Search Console. Described in privacy.html; adding GA to the app would need new App Store privacy answers.
- data.js/walks.js load with a 5-minute `?v=` tag (`/*wf-data*/` loader in build_gh.py; build_app.py swaps it for the app loader).
- Event fields added: `price` ("free"/"tickets"), `tix` (ticket page), `ha` (sports: home/away/neutral). Categories added: `sport`, `film` (movie releases have no lat/lon; the site adds a Showtimes link).

## Rainy Day tab (Nov 16, 2026)
- Fourth tab `#rainy` (slate, set apart from the other three): a forecast card (Open-Meteo `precipitation_probability_max` for this weekend's Fri–Sun at the home location rounded to 0.1°, cached 3 h in localStorage `wf-wx`; described in privacy.html), filter chips (All / Little kids / Teens / Dog OK / Free), "Indoors this weekend" (this weekend's events where `isIndoor()`: movies, or the venue text looks indoor), then the venues from rainy.js grouped and sorted by distance from home.
- rainy.js loads with data.js/walks.js (website `/*wf-data*/` loader; the app loader keeps `wf-app-rainy`, `wf-app-rainy-sydney`). The app gets the tab in its next release.

## Community categories (Nov 17, 2026, from a content-gap review)
- Why: the list was mostly things to watch or buy, for one household's tastes. New kinds of events to bring people together: `join` (group hikes, runs, sing-alongs, open mics, meetups), `vol` (volunteer shifts), `cult` (cultural celebrations: Las Posadas, Simbang Gabi, Kwanzaa, Yabun, Lunar New Year), `learn` (talks, library workshops, stargazing), `fmd` (free museum days; one item per museum with dates[], ids `fmd-` / `syd-fmd-`).
- Display: like markets and movies, each kind is ONE box per weekend with a dropdown (`CMK` + `pickBox` in app.js), under "Community this weekend" after the weekend's events, with one "Organizing something for the community? Tell us" line. With a category filter or search on, they show as normal cards. Old app versions (iPhone 1.3/1.4, Android 1.0) show them as plain "Other" cards (checked: no errors).
- Optional `aud` list on any event: all, seniors, adults, sensory, access, es, zh, vi, ar, ko (`AUD` in app.js), shown as small grey labels and searchable.
- East Bay is now a full region in the Bay Area refresh (map preset + town labels in src/cities/bayarea.json).
- Both refresh prompts were rewritten Nov 17, 2026 with these categories, sources, targets (Bay Area 260–320 items, Sydney 210–260, free ≥45%) and region shares. First runs with them: Sydney Nov 22 PT, Bay Area Nov 23.
- Icons for join/vol/cult are simple stroke drawings (`cm-*` in src/icons/paths.json, drawn with `s` stroke width in `wfIco`); swap for Gregor Cresnar icons when convenient. learn/fmd reuse the library and museum icons.

## Local small businesses (Nov 16, 2026)
- Event fields `local: 1` and `biz` (business name) mark activities run by independent local businesses. The site shows a green "Local" badge, a "Local business" quick pick in Filter, saves up to 2 top-pick spots per weekend for the nearest ones, and when a weekend has 2+ of them puts them in a "Shop local this weekend" box (nearest first) above the market/movie boxes.
- Both refresh prompts (Bay Area and Sydney) were updated Nov 16, 2026 to find 15–25 / 12–20 such weekend activities, home turf first, and to keep `local`/`biz`. The first refresh with this is Nov 23 (Sydney Nov 22 PT). Until then only a handful of Bay Area items are marked (hand-tagged Nov 16).

## Sign in with Apple on the website (Nov 16, 2026)
- Why: the app signs in with Apple, the website only had email codes. Anyone who chose "Hide My Email" in the app got a second, separate account on the website (the owner hit this: his group was on the Apple account).
- Code: accounts.js `WEB_APPLE` shows the Apple button on the website and calls `signInWithOAuth({provider:"apple"})` (implicit flow; the early script in build_gh.py catches `#access_token`). Switched on by `"appleWeb": true` in `src/sb.json` (build_gh.py replaces `__SB_APPLE__`). On since Nov 16, 2026. Services ID `io.github.oalwyn.weekendfetch.web` (Team 6AUG5CZ27G), key "Weekend Fetch Sign in with Apple" (Key ID K8CGX45655; the .p8 is with the owner only). Client secret made Nov 16, 2026, **expires May 18, 2027**: regenerate it (signed JWT: iss team, sub Services ID, kid key id, aud appleid.apple.com) and paste it into Supabase › Authentication › Providers › Apple before then.
- Group & account panel now says "Signed in as …" / "Signed in with Apple (email hidden)" (`signedInAsHTML`).
- Supabase Apple provider Client IDs must list both the bundle id (native app) and the web Services ID. The web client secret (a JWT made from the .p8 key) expires every 6 months: renew it in Supabase before then.

## Android app (started Nov 16, 2026; Google Play, organization account Alwyn Ventures LLC)
- Same Capacitor project as the iPhone app: `android/` (package `io.github.oalwyn.weekendfetch`, versionName/versionCode in `android/app/build.gradle`, first release 1.0 (1)). `app/www` is shared: build_app.py tags records `android-<ver>+<code>` or `ios-…` at run time.
- Build: `npm run android:build` (debug: `cd android && ./gradlew assembleDebug`), release bundle `npm run android:release` → `android/app/build/outputs/bundle/release/app-release.aab`. Needs `JAVA_HOME=~/Library/Android/jdk/jdk-21.0.13+9/Contents/Home` and `android/local.properties` (`sdk.dir=~/Library/Android/sdk`); Homebrew's openjdk builds from source on this Intel Mac, so Java/SDK were installed from Adoptium / dl.google.com instead.
- Emulator: AVD `wfpixel` (Android 16, Pixel 4). On this Mac use `-gpu swiftshader_indirect -cores 6 -memory 4096` (`-gpu host` hangs) and `adb shell svc power stayon true`. Debug builds allow WebView inspection: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`.
- Android-only code: `WFCalendarPlugin.java` (Add to Calendar via the calendar app's insert screen; resolves `{opened:true}`, no saved flag, so no calendar_added record), registered in `MainActivity.java`. Sign in with Apple isn't offered on Android (native_app.js checks `Capacitor.isPluginAvailable`); email codes only. `SCHEDULE_EXACT_ALARM` is removed in the manifest (reminders don't need exact alarms; avoids Play's declaration). Status strip: blue window background + `SystemBars.setStyle DARK`.
- Invite links: manifest App Link for `https://theweekendfetch.com/join`; needs `/.well-known/assetlinks.json` with the Play App Signing SHA-256 (from Play Console › App integrity) to open the app.
- Icons/splash/Play icon: `python3 src/tools/make_android_icons.py`. Listing, Data safety answers, content rating: `play-store/LISTING.md`; feature graphic `play-store/feature-graphic.png`.
- Stats: `supabase/v1.5-android.sql` accepts platform `android` and adds `android_sessions` to admin_report (dashboard column). Applied to the live project Nov 16, 2026 (by patching the live function definitions, same result). Re-run v1.5 after any re-run of v1.3/v1.4.
- Play Console: developer account "Alwyn Ventures LLC" (organization, account ID 7798996710165529057, owner oalwyn@cazavera.com, D-U-N-S 142939837) created Nov 16, 2026; website verified, trader status declared (trader). Waiting on Google's identity/organization check before an app can be created; then phone verification.
- Release signing: upload key in `android/keystore/` + `android/keystore.properties` (gitignored, owner's Mac only; back them up).
- Play Console app "The Weekend Fetch" (app id 4974583164825811490) created Nov 16, 2026: all App content forms done (18+, content rating Everyone/PEGI 3, Data safety per play-store/LISTING.md), store listing + graphics, countries US + Australia, production release 1.0 (1) sent to Google for review Nov 16, 2026 (managed publishing off: goes live on approval).
- Android 1.0 (1) approved and published by Google Nov 19, 2026. **Android 1.4.1 (versionCode 2)** — same code as iPhone 1.4.1 (community boxes, Rainy Day, etc.), versionName aligned with iOS from now on — sent to Google for review Nov 20, 2026 (managed publishing off). Uploading the .aab: the browser pane now blocks fetches to 127.0.0.1, so the bundle was put briefly at an unguessable path on the website (tmp-upload/, removed right after), fetched from a play.google.com/robots.txt tab into IndexedDB, then set on Play's file input. The bundle holds no secrets (no keystore; check with `unzip -l`).
- App review account: `review@theweekendfetch.com` signs in with a password instead of an email code (accounts.js `REVIEW_EMAIL`; Supabase Auth user; password in `android/keystore/review-account.txt`, gitignored). Use the same account for App Store review if asked.
- `/.well-known/assetlinks.json` lists the Play app-signing SHA-256 (8D:84:5B:…) and the upload key SHA-256 (55:ED:13:…).

## Commit conventions
`git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, with the message ending in:
`Co-Authored-By: Claude <noreply@anthropic.com>`

## Calm-UI decisions (Nov 16, 2026, from a UX review)
- Weekly markets (`isWeeklyMkt`) and new movies show as one dropdown box per weekend (`pickBox` in app.js); in Plans, weekly markets are a single "Pick a day" row.
- No "Pick your interests" bar on Events/Map (it opens from Filter › My interests). Card numbers (#25) show only on the map card. A "free" segment in `meta` is hidden when the Free pill shows. Header on phones: no slogan, one-line title, short tabs ("Our Plans"), "Updated <date>" top right.
- Also done Nov 16: each weekend shows ~8 top picks (`topPicks`: yours first, then nearest, max 2 per category) with "Show all N", and "Also open this weekend (N)" folded; the jump row ends with one-tap Holiday / Markets / Dog-friendly filters, after the weekend dates (`QCATS`); no trimming when a category filter or search is on. Search (🔍 in the filter bar, `state.q`, `matchQ`). Quick picks in Filter: Free, Dog-friendly (`isDogOk`), Saturday, Sunday. Map opens on "This weekend" (`state.mapWhen`; walks only with a dog filter). Plans: "Pick a day" (anything on several weekends, `multiWk`) comes first; empty weekends are one line. Cards: description clamped to 2 lines (tap for more), smaller link buttons. "Opens Fri Nov 13" shows as "Now through Jan 1" once open (`whenText`). One name per category (interests show the Filter name plus a hint); "Events" category is "Other"; home chip is 🏠.
- Not done: the Plans sign-in card is still full size; the device code stays at the bottom of Plans (privacy.html points there).

## Gotchas learned the hard way
- When inserting CSS by string replacement, make sure the anchor isn't inside another selector list (this once broke `header h1,header .slogan`).
- Sticky weekend banners use `top: var(--fh)`, the filter-bar height, which is set in `render()`.
- `typeof` on a `const` that hasn't been declared yet throws. app.js defines functions that gh_sync.js later redeclares; the later declaration wins.
- iOS: a deleted home-screen icon loses its storage; rejoining by invite link restores everything (data is server-side).

## Next project: App Store version (owner has an Apple developer account and a Mac)
Plan agreed with the owner: wrap the site with **Capacitor** (iOS) and add real native value, because Apple rejects plain website wrappers (App Review Guideline 4.2, Minimum Functionality). Planned features:
1. Local notifications: reminders for locked-in plans (e.g. the evening before and 2h before) and teen-program deadlines.
2. Add to Calendar for a locked plan (EventKit, or an .ics fallback).
3. Native geolocation for "home" and distances.
4. Native share sheet for invite links; ideally universal links so `#list-` invites open the app.
5. Later: a home-screen widget showing this weekend's plan (WidgetKit, needs Swift).

### iPhone app: submitted to Apple Nov 11, 2026 (v1.0 build 1, App Store Connect app ID 6833697642)
**Read `docs/PLAN-v1.1.md` first** (on the owner's Mac only) when Apple's review feedback arrives or before any app change. Don't change the app while it's in review.
- `docs/PLAN-*.md` are the owner's **private** plans. They're excluded from git in `.git/info/exclude`. Never commit, push, copy or summarize them into tracked files: this repo is public.

### Version 1.1 (website live Nov 13, 2026; app 1.1 build 5 submitted to Apple Nov 13; 1.0.1 approved)
- Database: `supabase/v1.1-groups.sql` (applied to the live project Nov 13, 2026). Then `supabase/v1.1-plans-extra.sql`: who's going (`group_rsvps`, `set_rsvp`), meet-ups (`set_meetup`, columns on `group_locks`), `get_my_plans` for the "All my plans" view and clash warnings; it redefines `get_group` and `set_group_lock`, so re-run it after re-running v1.1-groups.sql. Tests: `npm run test:db` (in-memory Postgres via PGlite; mimics Supabase's default function grants). The old `picks` RPCs stay for app 1.0.x and the current site.
- Supabase Auth: Email (magic link) and Apple (native, Client ID = bundle id) enabled; Site URL https://theweekendfetch.com.
- App ID has Sign In with Apple + Associated Domains enabled.
- App 1.1 (build 3): native Sign in with Apple (`WFAppleSignInPlugin` in ios/App/App/WFCalendarPlugin.swift → `window.WF_APPLE_SIGNIN` in native_app.js → `signInWithIdToken` with a SHA-256 nonce); `ios/App/App/App.entitlements` (Sign in with Apple + `applinks:theweekendfetch.com`, linked via CODE_SIGN_ENTITLEMENTS); @capacitor/app 8.1.2 opens invite links `https://theweekendfetch.com/join/?c=CODE` (`/.well-known/apple-app-site-association`, served thanks to `.nojekyll`); build_app.py copies `vendor/` into the app. accounts.js wrappers are named `_acct*` so they don't clash with native_app.js's `_setPlan` etc.
- Sign-in emails: Supabase custom SMTP via Resend (connected with Resend's Supabase integration; Resend account shared with Cazavera; domain theweekendfetch.com verified, DNS at Porkbun: resend._domainkey TXT, send/rsend CNAMEs, _dmarc TXT; Resend's receiving MX deliberately NOT added so Porkbun email forwarding keeps working). Sender noreply@theweekendfetch.com. Templates "Magic link or OTP" and "Confirm sign up" show {{ .Token }} (subject too). Email OTP length set to 6 (was 8), expiry 3600s; src/accounts.js expects 6 digits.

### Version 1.2 (submitted Nov 14, 2026)
- 1.1 approved and released. Build 1.2 (7) submitted to App Review Nov 14, 2026 (build 6 was pulled from review for the map-pin fix) (automatic release; What's New, description and review notes in `app-store/LISTING.md`). Adds sports/movies, Free/Tickets labels, the interests checklist and the past-day lock fix. Privacy answers unchanged.

### iPhone app: current state (merged into `main`)
- Home-screen name "Bay Fetch" (App Store name "The Bay Area Weekend Fetch"), bundle id `io.github.oalwyn.weekendfetch` (chosen by the owner). Capacitor 8.6.0, Swift Package Manager (no CocoaPods).
- App 1.0 (build 1) still has the old address built in, so it can't download fresh events. 1.0.1 (build 2) switches `LIVE` in build_app.py to https://theweekendfetch.com/.
- `src/build_app.py` rebuilds the site, then writes an app-only copy to `app/www/` (gitignored): share/invite links point at the live site, the latest `data.js`/`walks.js` are fetched from the live site at launch (saved in localStorage `wf-app-data`/`wf-app-walks`), safe-area CSS, non-blocking web fonts. The website's own `index.html` is not changed.
- Native features live in `src/native_app.js` (app-only, injected by build_app.py; it wraps `setPlan`, `refreshStars`, `lockedCtl`, `copyOut`): reminders for locked plans (7pm the evening before, 2h before start or 9am on the day) via @capacitor/local-notifications, permission asked on the first lock; "Add to Calendar" via the custom Swift plugin `ios/App/App/WFCalendarPlugin.swift` (EKEventEditViewController, no permission needed on iOS 17+; registered in `MainViewController`); invite links via @capacitor/share.
- **Uploading builds (since Nov 17, 2026):** use the App Store Connect API key "Weekend Fetch uploads" (App Manager role). The key ID, issuer ID and .p8 path are in `~/.appstoreconnect/weekend-fetch.env` on the owner's Mac only, and the .p8 sits in `~/.appstoreconnect/private_keys/` (chmod 600; never commit or print them; this repo is public). Upload: `xcodebuild -exportArchive -archivePath <archive> -exportOptionsPlist <ExportOptions.plist: method app-store-connect, destination upload, team 6AUG5CZ27G, automatic signing> -exportPath <dir> -allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID"` after `source ~/.appstoreconnect/weekend-fetch.env`. This avoids depending on Xcode's own sign-in (which lost its credentials on Nov 17). Revoke the key under App Store Connect › Users and Access › Integrations if the Mac is lost.
- Rebuild the app: `npm run app:build` (= `python3 src/build_app.py && npx cap sync ios`), then build in Xcode (`npm run app:open`). Native project lives in `ios/`.
- App-only fixes in build_app.py: no text selection, privacy link in the footer. (The plan-row time-range fix moved into src/app.js in 1.1; since Nov 15, 2026 `timeOf` sorts a range like "6:30–9:30pm" by its start.)
- iPhone-only (`TARGETED_DEVICE_FAMILY = 1`). Icon `ios/App/App/Assets.xcassets/AppIcon.appiconset` rendered from `icon.svg` at 1024px.
- App Store listing text, privacy-label answers, review notes and upload steps: `app-store/LISTING.md`. Screenshots (6.9", 1320×2868) in `app-store/screenshots/`. Privacy policy: `privacy.html` (live at https://theweekendfetch.com/privacy.html).

Notes for the App Store build:
- Keep the website working. Put the app shell in `ios/` (Capacitor), with `webDir` pointing at a build output that includes index.html, data.js, walks.js and the assets.
- The app should fetch the latest `data.js` from the live site at launch, falling back to the bundled copy, so twice-weekly refreshes reach the app without resubmitting.
- App Store Connect needs a privacy policy URL (could be a page in this repo), privacy labels (first name, anonymous list code, coarse location if used), screenshots, and a review note explaining invite-link sharing.
- Bundle id, signing team and app name are the owner's choice. Ask before creating them.
