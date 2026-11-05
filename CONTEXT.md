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
  a station's first visit, a short flick after. Never at the entrance, never with reduced motion. Visits
  are kept in memory only, and nothing on screen shows where you have been.
