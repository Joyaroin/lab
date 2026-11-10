// The sticky note on each TV's bezel: its colour and tilt (radians), pinned to the station by id so a
// TV leaving the room can't change the others' (they used to be picked by a TV's place in the list).
// Every note differs in both. Tilts are small enough that the note still covers the part of the
// baked note left of the glass (see Bezels.tsx).
const NOTES: Record<string, { colour: string; tilt: number }> = {
  work: { colour: "#f4e27a", tilt: -0.06 },
  mediasafe: { colour: "#f2a6b8", tilt: 0.02 },
  "home-lab": { colour: "#9fd8f0", tilt: 0.05 },
  "software-factory": { colour: "#f7c68b", tilt: 0.06 },
  contact: { colour: "#d3b8f0", tilt: -0.01 },
};

export function noteStyleFor(stationId: string) {
  const note = NOTES[stationId];
  if (!note) throw new Error(`no sticky note style for station "${stationId}"`);
  return note;
}
