# Context

The language of this project: its terms, what each one means, and what it doesn't.

- **Lab**: the whole site. A 3D late-night home lab that hiring teams tour to learn what Adham does.
  Not a page with a 3D header: the room is the site.
- **Room**: the 3D scene itself, its models and baked lighting.
- **Station**: a stop on the tour, with its own place in the room, world line and reading.
- **Tour**: the fixed camera path through the stations, driven by scrolling. It starts at the
  entrance, which is where the gap shows and is not a station.
- **World line**: a station's themed label, such as "World line 03". A label only: the copy beside it
  stays plain.
- **Hold**: a stretch of scroll at a station where the camera stays exactly on the stop, between the
  travel into it and the travel out. The reading stays fixed and the text is at full strength for all
  of it. Clicking the meter or a HUD link lands in the middle of the hold. The entrance has none.
- **Nearest stop**: the stop the camera is closest to, rounded from scroll progress (0 is the entrance).
  It changes halfway along a leg. In code: `nearestStop` (`TourState`, the HUD's prop). Not the same as
  the hold.
- **The hold you are in**: which station's hold the visitor is inside right now, or 0 on a leg or at the
  entrance. In code: `hold` (the shift object's getter, `holdAt` inside the shift module). A plain station
  number (`jump(station)`, `textState(station, ...)`) names a station and is neither of these.
- **Leg**: the stretch of travel between two stops: the entrance to the first station, or one station
  to the next. A hold is not part of a leg. Leg 1 is the first station to the second; the leg out of
  the entrance is leg 0.
- **Arc**: the curve the camera follows along a leg, through that leg's wide view. Under reduced motion
  the legs between stations are straight lines, not arcs; the leg out of the entrance stays an arc.
- **Wide view**: the camera's position halfway along a leg, pulled back to show the room, with both
  TVs of the leg small in frame. One per leg: `reveal` for the entrance leg, `arcs` in
  `room-layout.json` for the rest.
- **Title card**: the big label on the glass of a TV you aren't at: its station's world line over its
  name, such as "World line 03 / Home lab", readable from across the room. The words come from the
  station's `worldLine` and `name` in the content module, nothing else. It clears when that station's
  text is showing. It never moves and never reads as a live status or result.
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
- **Reading**: the number the meter shows. Each station has a fixed reading; the entrance shows the gap.
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
  the pulled-back view, where that view would be mostly dark. Only MediaSafe and WC2026 have one.
- **Shift**: the moment of arrival at a station, when the view tears and the meter scrambles and locks
  onto the reading. It fires once the visitor has stayed inside a hold, not when scrolling past. Full on
  a station's first visit, a short flick after. Never at the entrance, never with reduced motion. The
  tear is room-only: the HUD and the meter bar stay still. A Work page turn plays the short flick too, on
  that TV's screen only (not the room); the same limit counts it. On a return the text shows as soon as
  the wait ends and the flick plays over it; on a first visit it waits for the tear, then resolves out of
  it. The full tear re-cuts its bands once. No one-second window holds more than 3 sudden changes (the
  tear starting, a re-cut, the snap back), counted over a little more than a second to cover late
  frames; a shift held back by that still shows its text. Visits are kept in memory only, and nothing
  on screen shows where you have been.

## Modules

Where the code for each concept lives. Tests sit beside their code. Only modules that have been deepened
get a folder; the rest are still flat files in `src/`.

- **`src/shift/`**: the shift, start to finish. `createShift(reduced)` makes the one shift object; the app
  creates it and passes it to the room and the tour as a prop. Views read `shift.playing` (the shift the
  bar and the desk meter play; null once the visitor leaves its hold) and hear changes with
  `shift.subscribe`: the bar subscribes, the tear subscribes (and plays out its own length when `playing`
  goes null), and the desk meter reads it every frame. The tour `mount`s it, calls `observe(progress)` on
  every scroll and `turn()` on a Work page turn. The tear reports straight to it (`tearStarted`,
  `turnStarted`), and the desk meter reports when its power-on really began (`powerOnBegan`). The room
  gives it one function to ask for a frame (`setWake`). The module owns the wait timer, the power-on hold,
  the tear-over wake-up, the restore window after a reload, the leaving rule, the page-turn limit and the
  shift's lengths (`SHIFT_SECONDS`). `src/nixie.ts` re-exports `SHIFT_SECONDS` for the browser specs.
  `shift.hold` is the hold the visitor is in. The room asks it one question per station per frame,
  `shift.textState(station, progress, nowMs)`: `held`, `resolving` or `showing`. Asking changes nothing; the
  module's state changes when it learns something (a shift fires, the visitor leaves, a reload restores).
- The tour view (`TourView.tsx`) reads scroll and renders. The room (`Room.tsx`, `Effects.tsx`) draws the
  scene and the desk meter. The nixie module (`nixie.ts`) is the meter's digits and power-on.
