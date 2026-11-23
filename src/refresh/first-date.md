# First-date ideas (instructions for the weekly refresh routines)

The site has a "First date ideas" quick pick. Each refresh marks the events that pass the hard filters below by adding an
`fd` object to the item in the city's data.js. These are suggestions, not scientific guarantees, and never "the best first
date". Don't use dating-site rankings as evidence, and don't promise anyone's safety.

## Hard filters (an item gets `fd` only if it passes ALL of them)
- Public and populated: open to others, with staff or other visitors around.
- Not isolated or private: no homes, hotel rooms, private rooms or secluded trailheads.
- Meet at the venue: each person can arrive and leave on their own, ideally by transit, rideshare or parking.
- Daytime or early evening (starts before about 7:30pm). Not late-night-only.
- Not built around drinking. Alcohol may be on sale, but the activity must not depend on it (no bar crawls, wine or beer
  tastings, bottomless brunches, club nights).
- Verified current: date, time, price and place confirmed on the organiser's or venue's own page in this run.

## Preferences (record which are met in `m` and which are missed in `x`, using these codes)
- `short`: easy to leave or extend; about 45–90 minutes, with nearby options if it goes well.
- `talk`: people can hear each other, with natural pauses or somewhere to sit.
- `focus`: a shared focus beyond each other (walking, browsing, exhibits, tasting food, a light game).
- `novel`: mild novelty or play (a market, bookshop, small museum, mini golf, short class, scenic walk, ice skating,
  a low-key local event).
- `cheap`: free or low cost, no long advance booking, no expensive tickets.
- `access`: seating, restrooms, and parking or transit.
- `wx`: works in any weather (indoors, or a covered/indoor backup).

## Deprioritise (usually leave out, or list the problem in `x`)
Very loud venues; films or shows as the main activity; long events; intense or risky activities; large crowds; anything
that needs a lot of planning or a reservation far ahead.

## The `fd` object
```
"fd": {"dur": "60–90 min", "io": "indoor" | "outdoor" | "both",
       "next": "<a specific, real nearby follow-up: a named café, park or bookshop within a short walk>",
       "m": ["short", "talk", ...], "x": ["wx", ...],
       "src": "<where the facts were checked, e.g. 'Venue's event page, 23 Nov'>"}
```
- If something is unknown (for example no follow-up you could confirm), leave that field out and put the gap in `x` as a
  short plain phrase (e.g. "follow-up not checked") rather than guessing.
- Good sources of first-date items: farmers and makers' markets, small museums and galleries, free museum days and lates,
  bookshop events, short classes and workshops, light trails, ice rinks, garden and scenic walks with a café, board-game
  or puzzle events, low-key food events (not drinks-led), talks.
- Aim for 20–35 items with `fd` per city, spread across the next 4 weekends (at least 4 each weekend), across regions,
  with a mix of indoor and outdoor. Keep `fd` on an item from week to week when it still passes; re-check it.
- Also look for date-friendly places that run on fixed weekend hours (mini golf, ice rinks, bookshops with readings,
  pottery or painting drop-in sessions, board-game cafés) and list them as events with `dates[]` when the venue
  publishes specific sessions.
