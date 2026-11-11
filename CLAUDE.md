# The Bay Area Weekend Fetch: handoff notes

This is the project brief for Claude. Read it before changing anything.

## What this is
A mobile-first events site for a household in Mountain View, CA (with a dog), shared with other households.
It covers the North Bay (Marin, Napa, Sonoma, Santa Rosa), SF, the Peninsula, the South Bay, Santa Cruz, Monterey and Carmel.

- Live: https://oalwyn.github.io/weekly-fetch/ (GitHub Pages, branch `main`, repo root)
- Tabs: **Events** (by weekend or by date, with a Filter panel), **Map** (custom SVG coastline with pins), and **Our Weekend Plans** (a shared starred list, locked into specific days).
- Categories: `hol` holiday, `mkt` markets, `dog`, `food` pizza & coffee, `art`, `show` concerts & shows, `kids` young kids, `teen`, `prog` teen programs (application deadlines), `evt`, plus `walk` dog walks.

## Files
| Path | Role |
|---|---|
| `index.html` | **Built file, do not hand-edit.** Rebuild with `python3 src/build.py`. |
| `data.js` | Event data (`window.WF_DATA = {updated, sections, items}`). Rewritten twice a week by a scheduled Claude task (see below). Source of truth for events. |
| `walks.js` | Dog walks (`window.WF_WALKS = {items, nodogs}`), edited by hand. |
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
A Claude scheduled task ("Bay Area Weekend Fetch refresh (Mon + Thu)", 5:17am Pacific) runs in Anthropic's cloud. It researches events and **rewrites only `data.js`**, then commits and pushes to `main`.
So always `git pull` before working, and don't hand-edit `data.js` in ways the refresh would undo. Its prompt can be changed from claude.ai if categories or regions change.

## Commit conventions
`git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, with the message ending in:
`Co-Authored-By: Claude <noreply@anthropic.com>`

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

### iPhone app: current state (branch `ios-app`)
- App name "Weekend Fetch", bundle id `io.github.oalwyn.weekendfetch` (chosen by the owner). Capacitor 8.6.0, Swift Package Manager (no CocoaPods).
- `src/build_app.py` rebuilds the site, then writes an app-only copy to `app/www/` (gitignored): share/invite links point at the live site, the latest `data.js`/`walks.js` are fetched from the live site at launch (saved in localStorage `wf-app-data`/`wf-app-walks`), safe-area CSS, non-blocking web fonts. The website's own `index.html` is not changed.
- Native features live in `src/native_app.js` (app-only, injected by build_app.py; it wraps `setPlan`, `refreshStars`, `lockedCtl`, `copyOut`): reminders for locked plans (7pm the evening before, 2h before start or 9am on the day) via @capacitor/local-notifications, permission asked on the first lock; "Add to Calendar" via the custom Swift plugin `ios/App/App/WFCalendarPlugin.swift` (EKEventEditViewController, no permission needed on iOS 17+; registered in `MainViewController`); invite links via @capacitor/share.
- Rebuild the app: `npm run app:build` (= `python3 src/build_app.py && npx cap sync ios`), then build in Xcode (`npm run app:open`). Native project lives in `ios/`.

Notes for the App Store build:
- Keep the website working. Put the app shell in `ios/` (Capacitor), with `webDir` pointing at a build output that includes index.html, data.js, walks.js and the assets.
- The app should fetch the latest `data.js` from the live site at launch, falling back to the bundled copy, so twice-weekly refreshes reach the app without resubmitting.
- App Store Connect needs a privacy policy URL (could be a page in this repo), privacy labels (first name, anonymous list code, coarse location if used), screenshots, and a review note explaining invite-link sharing.
- Bundle id, signing team and app name are the owner's choice. Ask before creating them.
