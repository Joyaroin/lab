# Context

The language of this project: its terms, what each one means, and what it doesn't.

- **Lab**: the whole site. A 3D late-night home lab that hiring teams tour to learn what Adham does.
  Not a page with a 3D header: the room is the site.
- **Room**: the 3D scene itself, its models and baked lighting.
- **Station**: a stop on the tour, with its own place in the room, world line and reading.
- **Tour**: visiting the stations by clicking and stepping. The site opens on the overview; the HUD's links, the
  **keys** on the meter bar, the arrow keys and Esc move the visitor, as does clicking a TV (see **TV click**), and
  the camera follows the visit. Right is `next()` and Left is `prev()` (at the overview Right goes to Work and Left
  does nothing; in a flight they act on the stop being flown to; a key with a modifier is ignored). Nothing scrolls:
  the wheel never moves the camera (ADR 0005, spec #170).
- **Bench TV**: the switched-off TV on the workbench, once Order Tracker's. It has no station, so it is not in
  `crts` (one entry per station, in tour order); it is `bench` in `src/crts.ts`, from the `bench` key of
  `src/room-layout.json`, and `tools/room/build.py` still places it. `Phosphor.tsx` draws its glass dark over the
  baked lit glass. It has no title card, bezel layer, hover glow or click of its own: a click on it is a click on the
  room. The overview shows it dark, and it is not counted among the five stations.
- **TV click**: at the overview only, a TV takes a click and flies the visitor to its station, and a hover glow shows which
  one (`clickable` in `src/clickable.ts`, `easeGlow` in `src/glow.ts`). At a station or in flight no TV is clickable and no
  glow shows. At a station, a click on the room goes back to the overview: any press on the room that is not on that
  station's own TV (its glass or bezel), and another TV counts as the room from there (`goesBack` in `src/back.ts`, heard by
  `src/RoomClick.tsx`). A press that moves more than 6 px is a drag and does nothing. The desk meter's click still means
  next, and the HUD, the menu, the meter bar and the station's text are controls, not the room. At the overview and in
  flight it never applies, and not through a reduced-motion fade either (the fade's second half already reads as the new
  station, so the rule is given `visit.moving()`). Resting the pointer on a lit TV also previews its station on the meter
  (see **Hover preview**): `TvTargets` tells the tour which TV the pointer is on, through the meter link's `tvHover`.
- **Hover preview**: at the overview, resting the pointer on a lit TV or on a station's HUD link makes the meter show
  that station before the click. The bar's line changes at once to the station's world line and name only ("World line
  02: MediaSafe", no count); after the pointer has rested `PREVIEW_REST_MS` (150 ms) the digits play the short scramble
  (`SHIFT_SECONDS.short`, 0.25 s) onto the station's reading, or change with no scramble under reduced motion. Leaving,
  or moving to another station before the 150 ms (which starts the rest again), puts the gap's line and digits back at
  once with no animation. A visit ends the pointer's claim on a HUD link (it has not moved since), so back at the overview a
  pointer left on the link clicked shows no preview until it enters a link again; a pointer left on a TV starts its rest again
  on the landing. It is pointer only: keyboard focus never previews (the tour puts focus back on a HUD link
  whenever the visitor returns to the overview), touch has no preview, and it never applies at a station or in a flight.
  It is not a shift: the room never tears for it. The rule is in `src/bar.ts`: `createHover` (which station the pointer
  is on, from the TV and the HUD link, each reporting its own enter and leave), `previewStop` (only at the overview) and
  `meterDigits` (below). The tour feeds it and passes the result to the bar through the `reading`, `label` and `shift`
  props, so the bar is not edited for it.
- **Overview**: stop 0. A camera pose that shows the glass of all five station TVs and the whole desk meter on a
  landscape window at 16:9 and 16:10, with none of them under the HUD's name block, link row or the meter device
  (the boxes in `src/pin.ts`). The bench TV may be out of frame. It has its own wider field of
  view (`OVERVIEW` in `src/crts.ts`, 75 degrees at most; stations use `CAMERA_FOV`), and a separate pose for a
  portrait window. `src/visit/flight.test.ts` projects the TVs and the meter through the real camera to check this; if the
  HUD's boxes in `src/pin.ts` change, the pose may need to change with them. It is where the site opens and where Back (the HUD's Room link, Esc, the ROOM key) goes. The meter shows
  the gap there. It is not a station.
- **Visit**: where the visitor is and is going: at a stop, or flying to one. `src/visit/` owns it.
- **Cover**: the dark layer over the room that hides the cut of a reduced-motion fade. It rises at once but falls no faster
  than `COVER_MAX_FALL_PER_SEC` (`nextCover` in `src/visit/cover.ts`), so it never snaps off.
- **Flight**: the camera's move from where it is to a station (or to the overview): one smooth curve of
  0.9 s (`FLIGHT_MS`) that passes no other station (`flightPose` in `src/visit/flight.ts`). A move started mid-flight starts
  from where the camera really is. Under reduced motion a move is a quick fade, out, cut, in, about 300 ms, with
  no tear. A press during a fade waits until the fade ends, and the latest waiting press wins: it replaces any
  earlier one, and one for the stop just reached does nothing. `visit.target()` is the stop the last press asked for.
- **History**: the browser's history tracks the stop the URL shows (`linkHistory` in `src/visit/history.ts`): a move
  pushes an entry for its stop, a Back or Forward press moves the visit, and wherever the visitor lands that the URL
  doesn't show (a press that waited, or one dropped), an entry is pushed to correct it. Opening a direct link
  (`/#work`) lands there with no flight and no shift, with an overview entry under it so Back goes to the overview.
- **World line**: a station's themed label, such as "World line 03". A label only: the copy beside it
  stays plain.
- **Title card**: the big label on the glass of a TV you aren't at: its station's world line over its
  name, such as "World line 03 / Home lab", readable from across the room. The name is the large part:
  as big as the glass allows, wrapped onto two lines at a space when that makes it larger; the world
  line is small, above a rule. The words come from the
  station's `worldLine` and `name` in the content module, nothing else. It clears when that station's
  text is on its glass, which happens only in the Square framing (`textOnGlass`); on a portrait window
  the text is pinned beside the CRT and the card stays. It never moves and never reads as a live status
  or result.
- **Bezel**: the frame round a TV's glass. The baked one is soft up close, so a sharp layer is drawn over
  it: a crisp edge, a maker's plate and a sticky note. Its words come from the station's `bezel` in the
  content module, and none of it reads as a live status or result.
- **Maker's plate**: the small metal label on a bezel's bottom left, with a made-up model number such as
  "HALDEN HX-101". One per TV.
- **Sticky note**: the small coloured note at a bezel's top left, with a few words of its own and a tilt
  that differs on each TV, pinned to its station by id (`noteStyleFor` in `src/notes.ts`).
- **Diagram**: a station's line drawing on its glass. It redraws facts already in that station's copy
  and adds none, and never reads as a live status or result. Contact has none. Most are a left-to-right
  chain of steps joined by hops; Work's is its timeline, made of segments, with no steps or hops.
- **Page**: one of the parts a station's text is split into, shown one at a time (only Work has pages:
  Solace and Barracuda). Together the pages hold exactly the station's text, in order. The station
  opens on its first page and scrolling never changes it.
- **Timeline**: Work's diagram, and the switch between its pages. A row of segments drawn on the TV,
  oldest job on the left, and the only way to turn a page.
- **Segment**: one job on the timeline, a real button as wide as the months the job ran. It names the
  page and its dates; the open one is marked in words and shape, not colour alone.
- **Step**: one box in a diagram, such as "Argo CD".
- **Hop**: the arrow between two steps, with an optional label such as "by hand". A diagram has one fewer
  hop than steps.
- **Meter**: the nixie tube display at the centre of the site. It is our own design, and it is both
  navigation and a live readout.
- **Reading**: the number the meter shows. Each station has a fixed reading; the overview shows the gap, with its sentence in the long form ("MediaSafe: 9 staging deploys since the last prod release") or, on a short landscape window, the short form (see Meter bar).
- **Desk meter**: the meter as built in the room: seven nixie tubes on the desk, drawn live. Clicking it means
  next. It is a display in the room only: the meter bar's digits do not depend on whether it is in frame. Its digits
  and scramble come from `meterDigits` in `src/bar.ts`, the one function the bar reads too, so through a hover preview
  the two show the same digits and the same scramble; outside a preview it shows the reading at the visitor's place
  (rolling between two stops in a flight, where the bar shows the stop flown to) and the shift that is playing. The tour
  gives it the gap and the preview through the meter link (`deploys`, `preview`).
- **Meter bar**: the bar under the room, drawn as the **device**: the meter layers put together (below) at the size
  `deviceSize(win)` in `src/pin.ts` gives (420 px wide at 1920 x 1080, 417.6 at 1440 x 900, 280 on a phone), with the
  reading's digits as lit numerals over the tubes, the keys over their drawn keys, and the line under it (its height is `lineHeight(win)` in `src/pin.ts`, part of the bottom clearance, and the bottom clearance's `hudTier` test uses it too). The line is 14.4 px type, 12.8 px on a portrait window and on a short landscape window (the compact HUD). On a compact window its box may run wider than the device, up to the HUD's side margins (`HUD_MARGIN`; `lineMaxWidth(win)`), and it shows the **short form** of the gap sentence (`ui.gapBehindShort`, `ui.gapBehindAtLeastShort`: "MediaSafe: 9 deploys ahead of prod", "MediaSafe: 9+ deploys ahead of prod"; `gapLabel(gap, true)` in `src/gap.ts`, chosen by `isCompact(win)`), so the line is always one line there, from 560 px wide up (the saved form, `ui.gapSaved` around it, is 60 characters at a count of 100). The height is worked out from the real longest text of the form the window shows, at a count of 100 (what `countGap` returns at most and the save script stores; `lineTexts` in `src/pin.ts`). Elsewhere the box is at most the window less 1 rem. The line is the
  gap's sentence at the overview and, at a station, `ui.stopLine` filled in ("World line 02: MediaSafe · 2 of 5"; the
  total is the number of stations in the content module). The bar itself takes no click: only the keys do. In a flight
  it shows the stop being flown to (keys, line and digits). What it shows is one pure rule, `barFor(where, framing)` in
  `src/bar.ts`; `deviceLayers` in `src/meter-device.ts` maps a reading and the keys to the layers shown (a digit change
  changes one tube's image); `src/Meter.tsx` draws it. The device plays the power-on, as
  the desk meter does (`powerOn` in `src/nixie.ts`): as the boot screen goes, its tubes come up from dark. One number, the
  power-on's glow, is the opacity of the tubes' light layer, of the numerals and the dot, and of the drawn keys (the keys
  carry the tubes' light, so they come up with the tubes, and the device starts dark); the numerals flicker and settle left
  to right. `src/meter-power.ts` holds the rule and its frame loop, on the page's clock from `MeterLink.onMs`, when the boot
  screen began to go. Under reduced motion the device is lit at once. A device whose images arrive after the power-on, or
  while the plain version showed because they failed, appears lit and does not play it again; one that arrives part way joins
  where the clock is. The shift waits for the power-on as before. The images
  are files of their own, asked for while the boot screen is up (`src/meter-images.ts`); until they arrive, and for good
  if they fail, the bar is plain text digits and plain buttons. At the overview, a pointer resting on a TV or a station link changes the line, then the digits (see **Hover preview**); `meterDigits` in `src/bar.ts` gives the bar's digits and scramble.
- **Keys**: the buttons on the meter bar, with their words in `ui` (`keyPrev`, `keyRoom`, `keyNext`, `keyStart`) and
  their accessible names (`prevStation`, `backToRoom`, `nextStation`, `startTour`), each at least 44 x 44 px. On the device each is a transparent button over its drawn key (the drawn key already has the word, so the button's text is not painted); it brightens on hover and focus and shows a press, in CSS. At a
  station on a landscape window they are PREV, ROOM, NEXT; on a portrait window PREV and NEXT (the phone menu has the
  way back to the room); at the overview START alone. PREV is `visit.prev()` (the first station goes to the overview),
  NEXT is `visit.next()` (the last station goes to the overview), ROOM is `back()`, START goes to Work.
- **Meter layers**: the rendered images the meter bar's device is built from (ADR-0006): the case and tubes unlit, the
  tubes' light on the case, ten lit numerals all seven tubes share, the decimal point and the four keys (PREV, ROOM,
  NEXT, START), each with a clear background. `make meter` renders them from `tools/meter/` into `src/assets/meter/`, and
  `src/meter-layers.ts` lists each one's place and size on the 840 px wide device and how it is laid over the base.
  The key words come from `ui` in the content module, so changing one means rendering again.
- **Gap**: how many MediaSafe staging deploys have landed since the last promotion to prod. Real
  data, not decoration, and the meter says so when it's showing the saved value instead. Not config
  drift, which Argo CD keeps at zero.
- **Boot screen**: the instant lightweight first screen with Adham's name, title and real load progress.
- **Signal lost**: the one static screen shown when 3D can't start. Not a second site.
- **HUD**: the always-on overlay: a name block (name, title, availability), the Room link that goes back to the overview, the
  station links and the outside links (Résumé, LinkedIn, GitHub, which open a new tab and carry a ↗). On a landscape window
  at least `ONE_ROW_MIN_W` wide (1280 px) the name block is at the top left and one row of links at the top right: Room and the
  stations, a divider, the outside links. Narrower, the row moves to its own line under the name block, and under
  `TWO_LINE_MIN_W` (the link row's box plus both margins, 836 px) it wraps as two whole groups (stations, then outside
  links), a third line; no row holds a single link, which holds down to about 540 px wide, the stations group and both
  margins (narrower, the groups overflow rather than split). On a short landscape window (a phone held sideways) the HUD
  goes **compact**: no availability line, 14 px text. From `COMPACT_MIN_W` (655 px wide) two lines: the name, the title and the
  outside links, then Room and the stations; narrower, three: the name and title, the outside links, the stops. A window is
  short when its width's tier would leave the panel under `MIN_PANEL_H` (120 px): `height < tier top + 120 + bottom clearance` (the bottom as the full HUD has it)
  (`hudTier(win)` in `src/pin.ts`, a pure rule of the window): about 461 px under 747 wide (the full HUD's saved gap sentence, 82 characters, wraps to two lines), 443 at 747 to 835, 407 at 836 to 965, about 445 at
  1279. The compact tops are 76 px (two lines) and 107 px (three), from `COMPACT_LINE_H` and `COMPACT_GAP`; with them the glass and
  the panel stay above the device down to about 355 px tall (two lines) and 386 px (three), under which `MIN_PANEL_H` holds them
  at 120 px and they reach the meter. On a portrait window the
  name block spans the top with the name, title and outside links (no availability line), and Room and the stations are a
  bottom menu, three to a row, in buttons at least 44 px tall; the meter bar rises above it. All HUD text is at least 14 px.
  The current stop's link differs in weight and background as well as in `aria-current`; during a flight none is marked. The
  name block fits `NAME_BLOCK_W`, the link row `LINK_ROW_W` x `LINK_ROW_H`, and the HUD is no taller than the top
  clearance (`clearances(win).top`, all in `src/pin.ts`): on landscape the one-row HUD's height (90 px), the
  two-line HUD's (126 px) from `TWO_LINE_MIN_W`, the three-line HUD's (162 px) under it, or the compact HUD's, each worked out from the boxes. A hint line 8 px above the bottom clearance tells the visitor what to
  click; it fades after the first landing at a station and stays gone.
- **Phone stop**: a station's own camera stop, look point and text pin used on a portrait window instead of
  the pulled-back view, where that view would be mostly dark. Only MediaSafe and Software factory have one.
- **Framing**: how the camera and the text are set for the window's shape. Two exist. **Square** (a window
  at least as wide as tall): each station's own square stop, worked out from the window; the text is laid
  over the glass; no mouse parallax at a station. **Portrait** (taller than wide): the pull-back, or the phone
  stop where a station has one; the text pinned beside the CRT; full parallax. Chosen from the current
  window each time, so rotating or resizing switches it. In code: `framingFor(window)` in `src/framing`. On a short landscape window the text panel and glass keep at least `MIN_PANEL_H` between the HUD and the meter bar, which the compact HUD tiers and the one-line (short) text under the device make room for, at every width from 560 px up, with no exception (`src/pin.test.ts` sweeps the short landscape windows). Under 355 px tall (386 px under 655 px wide) no HUD leaves that room and the panel is held at the floor.
- **Where**: where the visitor is, as a value: at a stop (0 is the overview, 1..n a station), or flying from one stop
  to another with `f`, the share of the flight done. `visit.where(now)` gives it; the framing and the text's
  strength take it.
- **Shift**: the moment of arrival at a station, when the view tears and the meter scrambles and locks
  onto the reading. It fires as the camera lands, with no wait (once the power-on hold is over), not when flying through. Full on
  a station's first visit, a short flick after. Never at the overview, never with reduced motion. There is no restore window: a reload followed by a click plays the shift. The
  tear is room-only: the HUD and the meter bar stay still. A Work page turn plays the short flick too, on
  that TV's screen only (not the room); the same limit counts it. On a return the text shows on
  the landing and the flick plays over it; on a first visit it waits for the tear, then resolves out of
  it. The full tear lasts 0.4 s and re-cuts its bands once; the short flick lasts 0.25 s. No one-second window holds more than 3 sudden changes (the
  tear starting, a re-cut, the snap back), the snap back counted where it is visible (the slip reaches 0, at
  0.85 of the tear's length: 340 ms of a full tear, 212.5 ms of a short one, `snapBackMs` in `src/tear.ts`),
  not where the tear's length ends; the text still waits for the full length plus `SNAP_BACK_MS`. Counted
  over a little more than a second to cover late frames; a shift held back by that still shows its text.
  Visits are kept in memory only, and nothing on screen shows where you have been.

## Modules

Where the code for each concept lives. Tests sit beside their code. Only modules that have been deepened
get a folder; the rest are still flat files in `src/`.

- **`src/visit/`**: the visit. `createVisit({ reduced })` makes the one visit object; the app creates it and gives it to
  the room and the tour. `go(stop)`, `back()` and `next()` start a flight from wherever the camera is, mid-flight
  included; `land(stop)` puts the visitor at a stop with no flight. `where(nowMs)`, `fade(nowMs)` and `moving(nowMs)` (a flight or a fade is running) read it, and
  `launch(nowMs)` gives where the current flight began (a chain of re-targets), which `framing.cameraAt` resolves with
  `flightPose`. The visit has no timer: the room's per-frame read (`CameraRig`) is what notices a landing and fires
  `land`. `flight.ts` is the pure path (`flightPose`, with its field of view) and is tested without a browser. `history.ts` holds
  `linkHistory`, which ties the browser's history to the visit. `route.ts` holds `stopForHash` and `hashForStop`, which turn a URL
  hash into a stop and back. `cover.ts` holds `nextCover`, the cover limiter.
- **`src/shift/`**: the shift, start to finish. `createShift(reduced)` makes the one shift object; the app
  creates it and passes it to the room and the tour as a prop. Views read `shift.playing` (the shift the
  bar and the desk meter play; null once the visitor leaves its station) and hear changes with
  `shift.subscribe`: the bar subscribes, the tear subscribes (and plays out its own length when `playing`
  goes null), and the desk meter reads it every frame. The tour `mount`s it, calls `observe(where)`
  when a move starts and when it lands and `turn()` on a Work page turn. The tear reports straight to it (`tearStarted`,
  `turnStarted`), and the desk meter reports when its power-on really began (`powerOnBegan`). The room
  gives it one function to ask for a frame (`setWake`). The module owns the power-on timer, the power-on hold,
  the tear-over wake-up, the leaving rule, the page-turn limit and the
  shift's lengths (`SHIFT_SECONDS`). No shift starts until the desk meter reports its power-on, which it
  does on the first frame it draws once the room is ready (`src/App.tsx:53` sets `meter.on`,
  `src/DeskMeter.tsx:76` reports), so a room that never draws a frame plays no shift. `src/nixie.ts`
  re-exports `SHIFT_SECONDS` for the browser specs. `shift.hold` is the station the visitor is at (0 at the overview or in flight). The room
  asks it one question per station per frame, `shift.textState(station, nowMs)` (the shift knows where the visitor is): `held`,
  `resolving` or `showing`. Asking changes nothing; the module's state changes when it learns something
  (a shift fires, the visitor leaves).
- **`src/text/`**: a station's text. `ScreenPanels` renders the panels and holds their CSS states (`data-gated`,
  `data-glass`, `data-more`, the "more" cue). `TextPins` runs inside the canvas every frame, after the camera
  moves, and calls `placeText` for each panel: opacity, visibility, whether it takes the wheel, and its place
  over the glass or pinned beside the CRT. The room only mounts `TextPins`. The text keeps only what it last
  drew, in the module (a per-panel record), and writes it out as `data-gated` for the CSS and the browser
  specs: the resolve starts once when held text comes out, and a return just appears. The text *state* is
  never read back from the element; `placeText` still reads the panel's `maxHeight`, `scrollTop` and
  `scrollHeight` for layout. Whether the text is held, resolving or showing is the shift's to say
  (`textState`); the text module does not repeat that rule. The meter's check for text covering it asks
  `textCovers`, and nothing outside the module reads the panels' inline styles (the tear view only sets
  its filter).
- **`src/framing/`**: the framing. `framingFor({ width, height })` picks Square or Portrait, and is called with
  the current window each time. The framing answers `cameraAt(where, launch)` (camera, look and field of view; a flying Where is `flightPose` from the launch pose to the stop),
  `textOnGlass(where, station)`, `parallaxStrength(where)` and `panelPoint(crt)`, each taking a **Where**; nothing else decides
  the portrait split. The tour module (`src/tour.ts`) keeps `readingAt(where, gap)` and the mouse `parallax`; `panelStrength(where, station)` in `src/hold.ts` takes a Where. The room the HUD and the meter bar take is one pure rule of the window in `src/pin.ts` (`clearances`, with `deviceSize`); the camera's stop and the text panel both read it, and on a portrait window the panel takes all the free height. On a landscape window its top is one of five tiers (one row, two lines, and under `TWO_LINE_MIN_W` three lines, by width; or the compact two or three lines on a short window, by height as well, as the HUD entry says), so the stop and the panel clear the HUD at 800 px wide as at 1440 and at 667 x 375, and the glass is always above the device wherever the window is tall enough for `MIN_PANEL_H`.
- **`src/content.ts`**: all copy in the app: station text, links, the bezel and timeline words, and `ui`, the
  rest of what visitors see or hear (HUD, meter aria labels, boot log, signal lost, the gap's sentence).
  Templates take `{name}` placeholders through `fill`. Components hold none of it; a test fails if a `ui`
  word turns up quoted in other `src` code. `validateContent` covers every key. Only the name, title and page
  title are also in `index.html`, so they show before the script runs; a test checks they match. Failure
  codes such as `no-webgl` and the other identifiers stay in code: they are ids, not copy.
- The tour view (`TourView.tsx`) reports the visit to the shift and the HUD, and renders. The HUD (`Hud.tsx`) has the links: stations fly, Room goes back. The meter bar (`Meter.tsx`) has the keys, and the arrow keys are heard in `TourView.tsx`. The room (`Room.tsx`, and the overlays `DeskMeter.tsx`, `Phosphor.tsx`, `Bezels.tsx`, `Rain.tsx`, `TvTargets.tsx`, `RoomClick.tsx`, with `draw.ts` for what they share) draws the
  scene and the desk meter. `card.ts` draws the phosphor screen and title card on each glass, and `glass.ts` projects a glass to window pixels. `theme.css`, imported by `src/main.tsx`, is the focus ring and the boot progress bar's colours. The nixie module (`nixie.ts`) is the meter's digits and power-on; `meter-power.ts` is how lit the bar's device is through it.
- **`src/frames.ts`**: the frame loop. `runFrames(step, opts)` runs `step` with the seconds since the loop started,
  the first time at once with 0 s and then on each requested frame, until `step` returns true; it returns a function
  that stops it. Its clock and frame scheduler are `opts.now`, `opts.request` and `opts.cancel`, defaulting to
  `performance.now`, `requestAnimationFrame` and `cancelAnimationFrame`; `opts.onStart` gets the clock reading the loop
  counts from. `useTear` (`src/TearView.tsx`, through `playTear` in `src/tear-draw.ts`) and `useShifted` (`src/Meter.tsx`) run on it. Its timing is tested in
  `src/frames.test.ts` with a fake clock and a fake frame scheduler.
- **`src/tear.ts`** and **`tests/lib/snap.ts`**: the flash count takes the snap back from `snapBackMs` in
  `src/tear.ts` (where the slip reaches 0), and the browser specs watch for it with `tests/lib/snap.ts`
  (changed by ddf9420), not for the filter coming off. `playTear` (`src/tear-draw.ts`) writes displacement scale 0
  and edge 0 on its last step, before it takes the filter off, so a frame that steps from slip > 0 straight to done
  still leaves the snap back on record; `src/tear-draw.test.ts` tests it with a fake clock.
