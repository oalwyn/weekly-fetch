# How to refresh a city (shared method for every refresh routine)

Each city's routine prompt names the city key (e.g. `seattle`) and points here. Also read, every run:
- `src/refresh/cities/<key>.md`: that city's regions, sources, sport teams, targets and spelling;
- `src/refresh/venues.md` (that city's section): venues and council pages to go through one by one;
- `src/refresh/first-date.md`: add `fd` to the items that pass its hard filters;
- `src/refresh/golf.md`: the Golf category.

**The Bay Area lives at the site root** (its `path` is empty): its files are `data.js`, `walks.js`, `rainy.js`, `dates.js` at the repo
root, its progress file is `PROGRESS-bayarea.md`, and wherever this method says `git add <path>/` or `git checkout <key>-wip -- <path>/`,
use exactly `data.js PROGRESS-bayarea.md` (and on main only `data.js`); never add or check out the whole repo root.

`<path>` below is the city's `path` in `src/cities/<key>.json` (`seattle`, `la`, `montana`, …); `<prefix>` is its `prefix`
(`sea-`, `la-`, `mt-`, …). The map box is the `bbox` [S, N, W, E] in the city's coast file (`src/<coast>`).

## 0. Save as you go (most important rule)
Runs get cut off by usage limits. Work in the groups below and save after each one to the branch `<key>-wip`, so the next
run carries on instead of starting over.
1. `git fetch origin`. If `origin/<key>-wip` exists AND its `<path>/PROGRESS.md` is dated within the last 4 days:
   `git checkout -B <key>-wip origin/<key>-wip`, read PROGRESS.md and data.js, and CONTINUE with the first group not done
   (don't redo finished groups or re-check sources listed there). Otherwise: `git checkout main && git pull`,
   `git push origin --delete <key>-wip` if an old one exists (ignore errors), `git checkout -B <key>-wip`, write a fresh PROGRESS.md.
2. After EACH group: make the files valid (`python3 src/tools/check_data.py <key>` passes), update PROGRESS.md (run date,
   mode deep/light per week, each group done/not done with its count, sources already checked), then
   `git add <path>/ && git -c user.name=Claude -c user.email=noreply@anthropic.com commit -m "<City> refresh in progress: group <X>" && git push -u origin <key>-wip`.
   Never go more than about 25 new items without saving.
3. Only when every group is done (or genuinely exhausted): publish to main WITHOUT PROGRESS.md:
   `git checkout main && git pull && git checkout <key>-wip -- <path>/ && git rm -q --cached <path>/PROGRESS.md 2>/dev/null; rm -f <path>/PROGRESS.md; git add <path>/ && git -c user.name=Claude -c user.email=noreply@anthropic.com commit -m "<City> refresh <date>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin HEAD:main`
   (if rejected: `git pull --rebase` and push again). Then `git push origin --delete <key>-wip`.
   The site shows a new city as soon as `<path>/data.js` is on main, and the event-pages GitHub Action builds its share pages.

## 1. Deep vs light (saves effort on weeks already covered)
data.js carries `"deep_through": "YYYY-MM-DD"`: the last day already researched in depth.
- **Light touch** for days up to `deep_through`: drop past events; re-check only items whose page might have changed
  (sold out, cancelled, moved, "dates TBC" now confirmed); add genuinely new big announcements you come across, and fill a
  weekend that has fewer than 20 things. Don't re-research a category from scratch. Aim for about a quarter of the effort.
- **Deep** for days after `deep_through` up to today + 8 weeks (and everything, when there is no data.js or no
  `deep_through`): full research for every group below.
- At the end set `deep_through` to today + 8 weeks (in the city's time zone).
Record in PROGRESS.md which weeks were light and which deep.

## 2. Setup (only when `<path>/data.js` doesn't exist yet: a new city's first run)
Make, besides data.js, these files (formats: copy london/walks.js, london/rainy.js, london/dates.js exactly):
- `<path>/walks.js` (`window.WF_WALKS = {items, nodogs}`): 12–18 dog-friendly walks, parks, beaches and off-leash areas,
  ids `walk-<prefix-without-dash>-...`, `n` "W1"…, `sec` "walks", `cat` "walk"; `when` = the leash rule as the agency states it;
  `nodogs`: well-known places where dogs are NOT allowed (a short list with the reason). Check each on the agency's own page.
- `<path>/rainy.js` (`window.WF_RAINY`): 25–40 Rainy Day venues (grp museum/play/cozy/dog; tags kids/teens/dog/free; price),
  ids `<prefix>rd-...`, each url checked.
- `<path>/dates.js` (`window.WF_DATES`): 12–25 standing first-date spots that pass src/refresh/first-date.md, ids `<prefix>dp-...`.
- `<path>/manifest.webmanifest`: copy london/manifest.webmanifest, change name, short_name ("<Short> Fetch"), description,
  scope, start_url and id to `/<path>/`.
Do these as group S (save after it), before group A.

## 3. Research groups, in this order
S setup (first run only) · A markets incl. weekly farmers markets (mkt) · B holiday & seasonal (hol) · C concerts, theater,
comedy, ballet (show) · D sport · E golf (golf.md) · F new movies (film) · G kids, teens, programs (kids, teen, prog) ·
H art, food, dog, evt · I community join + vol · J community cult + learn + fmd · K local independent businesses ·
L venues.md pass (go venue by venue and council by council) · M first-date marks (fd) · N balance pass (regions, free
share, aud, every weekend has 20+ things).

## 4. Links, prices, fields (same rules as every city)
- `url`: the organiser's or venue's own event page, or the official box office it links to. NEVER aggregators or resale
  (Time Out, Eventbrite discovery pages, Do206, Discover LA listings, StubHub, Vivid Seats, etc.). Strip tracking parameters.
  No organiser page: omit url. Check the year: last year's page does not confirm this year's dates.
- `price` "free" (incl. free with booking) or "tickets" (ticket, entry or registration fee); `tix` the official ticket page
  if different. A short price hint in meta ("from $25", "free, RSVP").
- Fields: n (renumber 1..N in section order, then by start; "programs" by deadline), id, sec, when (e.g. "Sat Nov 28 · 7pm"),
  title, meta (starts with venue/town), cat, url, price, tix, ha (sport), lvl (golf), local + biz, aud, fd, lat, lon (inside the
  map box), q, tbc, and dates as start/end, or dates[], or days[] with start/end. `prog` items: sec "programs", `deadline`.
- cat: hol, mkt, dog, food, art, show, sport, golf, film, kids, teen, prog, join, vol, cult, learn, fmd, evt.
- ids: start with `<prefix>`, lowercase-hyphen; keep an existing item's id while it's listed; never reuse an old id.
- sections: [["week","This week"],["late-nov","Late November"],["early-dec","Early December"],["mid-dec","Holidays & New Year"],
  ["jan","January"],["tbc","Dates to be confirmed"],["dog","Dog-friendly"],["food","Food & coffee"],
  ["programs","Programs, camps & sign-ups"],["radar","On the radar"]] (relabel to the months covered; keep the keys).
- Community: each of join/vol/cult/learn/fmd shows as one box per weekend, so list generously (counts in the city file).
  fmd: one item per museum with its free days as dates[], ids `<prefix>fmd-...` kept week to week.
- Farmers markets: one `mkt` item per market with dates[] = every market day in the window; ids `<prefix>fm-...` kept.
- Local businesses: `local: 1` and `biz`; dated weekend activities by independents (not chains, big venues, councils).
- Movies: new releases per weekend, no lat/lon/q, meta "In theaters · <rating> · <genre> · <runtime>".
- `aud` only when the organiser says so: all, seniors, adults, sensory, access, es, zh, vi, ar, ko.
- "updated": "Updated <Weekday, Mon D, YYYY> · this week + the next two months" (city's date when you finish).

## 5. Checks before each save
- `python3 src/tools/check_data.py <key>`: ids, prefix, map box, prices, categories, golf levels; prints counts by category and region.
- `python3 src/tools/event_ids.py check --file=<path>/data.js`: "RE-ID: old -> new" means change it back to the old id.

## 6. Final message
Counts by category and region, community items per weekend, farmers markets, local-business items per weekend, golf items,
items with price/tix/aud/fd, the free share, which weeks were deep vs light, and which sites stayed unreadable.
