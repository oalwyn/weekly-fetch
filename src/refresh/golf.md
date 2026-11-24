# Golf (category `golf`, added Nov 24, 2026; every city's refresh follows this)

Golf events people can go to, watch or take part in, in the city's map area:
- **Pro tournaments** (`lvl: "pro"`): PGA TOUR, LPGA, PGA TOUR Champions, Korn Ferry, DP World Tour, LIV, Australasian /
  PGA of Australia, Ladies European Tour, TGL (indoor league) and pro-ams. One item per tournament (start/end = its days);
  meta "Course, Town · tour · men's/women's"; url the tournament's own site; `price` "tickets" (or "free" if entry is free).
- **Amateur** (`lvl: "amateur"`): state/regional golf association championships and qualifiers, US/national amateur
  qualifiers, college events, city and county championships people can watch or enter.
- **Community** (`lvl: "community"`): charity scrambles and fundraisers open to the public, junior clinics and camps,
  women's and beginners' golf days, free or low-cost lessons at public courses, adaptive golf, holiday putting/par-3 events,
  public driving-range events, Topgolf/PopStroke-style community nights only when they're a dated special event.
Rules: dated events only (no "open every day" listings), confirmed on the organiser's or course's own page. Junior camps with
a sign-up deadline go in `prog` (sec "programs") with "golf" in the title. Off-season (winter in Seattle, Montana, London) has
few events: list what genuinely exists (indoor leagues, simulators' dated events, winter clinics, tournaments within the window)
and don't pad. Targets per run: Los Angeles 8-15, Bay Area 6-12, Sydney 6-12, Seattle 3-8, London 2-6, Montana 2-6.
