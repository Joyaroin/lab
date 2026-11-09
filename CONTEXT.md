# Context

The language of this project: its terms, what each one means, and what it doesn't.

- **Lab**: the whole site. A 3D late-night home lab that hiring teams tour to learn what Adham does.
  Not a page with a 3D header: the room is the site.
- **Room**: the 3D scene itself, its models and baked lighting.
- **Station**: a stop on the tour, with its own place in the room, world line and reading.
- **Tour**: visiting the stations by clicking. The site opens on the overview; the HUD's links, the meter and
  Esc move the visitor, and the camera follows the visit. Nothing scrolls: the wheel never moves the camera
  (ADR 0005, spec #170).
- **Overview**: stop 0. A camera pose that shows every TV on a landscape window, with its own wider field of
  view (`OVERVIEW` in `src/crts.ts`, 75 degrees at most; stations use `CAMERA_FOV`), and a separate pose for a
  portrait window. It is where the site opens and where Back (the HUD's Room link, Esc) goes. The meter shows
  the gap there. It replaced the entrance, the close-up on the desk meter. It is not a station.
- **Visit**: where the visitor is and is going: at a stop, or flying to one. `src/visit/` owns it.
- **Flight**: the camera's move from where it is to a station (or to the overview): one smooth curve of about
  1.2 s that passes no other station (`flightPose` in `src/visit/flight.ts`). A move started mid-flight starts
  from where the camera really is. Under reduced motion a move is a quick fade, out, cut, in, about 300 ms, with
  no tear.
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
  that differs on each TV.
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
- **Reading**: the number the meter shows. Each station has a fixed reading; the overview shows the gap.
- **Desk meter**: the meter as built in the room: seven nixie tubes on the desk, drawn live. It is the
  meter's main display wherever it is in frame.
- **Meter bar**: the plain label under the room that explains the reading. It also shows a small
  copy of the digits when the desk meter is out of frame, too small, or under a panel.
- **Gap**: how many MediaSafe staging deploys have landed since the last promotion to prod. Real
  data, not decoration, and the meter says so when it's showing the saved value instead. Not config
  drift, which Argo CD keeps at zero.
- **Boot screen**: the instant lightweight first screen with Adham's name, title and real load progress.
- **Signal lost**: the one static screen shown when 3D can't start. Not a second site.
- **HUD**: the small always-on corner overlay with résumé, contact and station links.
- **Phone stop**: a station's own camera stop, look point and text pin used on a portrait window instead of
  the pulled-back view, where that view would be mostly dark. Only MediaSafe and Software factory have one.
- **Framing**: how the camera and the text are set for the window's shape. Two exist. **Square** (a window
  at least as wide as tall): each station's own square stop, worked out from the window; the text is laid
  over the glass; no mouse parallax in a hold. **Portrait** (taller than wide): the pull-back, or the phone
  stop where a station has one; the text pinned beside the CRT; full parallax. Chosen from the current
  window each time, so rotating or resizing switches it. In code: `framingFor(window)` in `src/framing`.
- **Where**: where the visitor is, as a value: at a stop (0 is the overview, 1..n a station), or flying from one stop
  to another with `f`, the share of the flight done. `visit.where(now)` gives it; the framing and the text's
  strength take it. (`whereAt(progress)` in `src/where.ts` is the old scroll adapter, kept for unit tests.)
- **Shift**: the moment of arrival at a station, when the view tears and the meter scrambles and locks
  onto the reading. It fires once the visitor has stayed at a station for the wait, after the flight has landed, not when flying through. Full on
  a station's first visit, a short flick after. Never at the overview, never with reduced motion. There is no restore window: a reload followed by a click plays the shift. The
  tear is room-only: the HUD and the meter bar stay still. A Work page turn plays the short flick too, on
  that TV's screen only (not the room); the same limit counts it. On a return the text shows as soon as
  the wait ends and the flick plays over it; on a first visit it waits for the tear, then resolves out of
  it. The full tear re-cuts its bands once. No one-second window holds more than 3 sudden changes (the
  tear starting, a re-cut, the snap back), the snap back counted where it is visible (the slip reaches 0, at
  0.85 of the tear's length: 680 ms of a full tear, 212.5 ms of a short one, `snapBackMs` in `src/tear.ts`),
  not where the tear's length ends; the text still waits for the full length plus `SNAP_BACK_MS`. Counted
  over a little more than a second to cover late frames; a shift held back by that still shows its text.
  Visits are kept in memory only, and nothing on screen shows where you have been.

## Modules

Where the code for each concept lives. Tests sit beside their code. Only modules that have been deepened
get a folder; the rest are still flat files in `src/`.

- **`src/visit/`**: the visit. `createVisit({ reduced })` makes the one visit object; the app creates it and gives it to
  the room and the tour. `go(stop)`, `back()` and `next()` start a flight from wherever the camera is, mid-flight
  included; `land(stop)` puts the visitor at a stop with no flight. `where(nowMs)` and `fade(nowMs)` read it, and
  `launch(nowMs)` gives where the current flight began (a chain of re-targets), which `framing.cameraAt` resolves with
  `flightPose`. The visit has no timer: the room's per-frame read (`CameraRig`) is what notices a landing and fires
  `land`. `flight.ts` is the pure path (`flightPose`, with its field of view) and is tested without a browser.
- **`src/shift/`**: the shift, start to finish. `createShift(reduced)` makes the one shift object; the app
  creates it and passes it to the room and the tour as a prop. Views read `shift.playing` (the shift the
  bar and the desk meter play; null once the visitor leaves its station) and hear changes with
  `shift.subscribe`: the bar subscribes, the tear subscribes (and plays out its own length when `playing`
  goes null), and the desk meter reads it every frame. The tour `mount`s it, calls `observe(where)`
  when a move starts and when it lands and `turn()` on a Work page turn. The tear reports straight to it (`tearStarted`,
  `turnStarted`), and the desk meter reports when its power-on really began (`powerOnBegan`). The room
  gives it one function to ask for a frame (`setWake`). The module owns the wait timer, the power-on hold,
  the tear-over wake-up, the leaving rule, the page-turn limit and the
  shift's lengths (`SHIFT_SECONDS`). No shift starts until the desk meter reports its power-on, which it
  does on the first frame it draws once the room is ready (`src/App.tsx:48` sets `meter.on`,
  `src/Effects.tsx:120` reports), so a room that never draws a frame plays no shift. `src/nixie.ts`
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
  the portrait split. The tour module (`src/tour.ts`) keeps the readings: `tourAt(progress, gap)` and `readingAt(where, gap)`
  (the old scroll legs and `flyAlong` are still there, unused by the app, until a cleanup removes them; `panelStrength` in `src/hold.ts` takes a Where or a progress). The narrow-window width check in `src/pin.ts` (`NARROW`) is a different rule and stays.
- **`src/content.ts`**: all copy in the app: station text, links, the bezel and timeline words, and `ui`, the
  rest of what visitors see or hear (HUD, meter aria labels, boot log, signal lost, the gap's sentence).
  Templates take `{name}` placeholders through `fill`. Components hold none of it; a test fails if a `ui`
  word turns up quoted in other `src` code. `validateContent` covers every key. Only the name, title and page
  title are also in `index.html`, so they show before the script runs; a test checks they match. Failure
  codes such as `no-webgl` and the other identifiers stay in code: they are ids, not copy.
- The tour view (`TourView.tsx`) reports the visit to the shift and the HUD, and renders. The HUD (`Hud.tsx`) has the links: stations fly, Room goes back. The room (`Room.tsx`, `Effects.tsx`) draws the
  scene and the desk meter. The nixie module (`nixie.ts`) is the meter's digits and power-on.
- **`src/tear.ts`** and **`tests/lib/snap.ts`**: the flash count takes the snap back from `snapBackMs` in
  `src/tear.ts` (where the slip reaches 0), and the browser specs watch for it with `tests/lib/snap.ts`
  (changed by ddf9420), not for the filter coming off.
