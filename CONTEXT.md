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
- **Title card**: the big label on the glass of a TV you aren't at: its station's world line over its
  name, such as "World line 03 / Home lab", readable from across the room. The words come from the
  station's `worldLine` and `name` in the content module, nothing else. It clears when that station's
  text is showing. It never moves and never reads as a live status or result.
- **Diagram**: a station's line drawing on its glass, a left-to-right chain of steps. It redraws facts
  already in that station's copy and adds none, and never reads as a live status or result. Contact has none.
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
