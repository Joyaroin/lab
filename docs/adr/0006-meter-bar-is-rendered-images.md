# The meter bar is rendered images

The meter bar is a device: our own walnut case with seven glass nixie tubes and legend keys (ADR-0002). It is
built from images rendered ahead of time, not from a live 3D view. A second 3D canvas next to the room was
turned down: it costs more on a phone, and nothing on the device moves except the digits, which are lit
numerals swapped in the tubes. The images are layers (the unlit device, the tubes' light on the case, ten lit
numerals that all seven tubes share, the decimal point, and one for each key) so the bar can show the device dark,
lit to any level, with any digit in any tube and any set of keys. `src/meter-layers.ts` lists them, each with its
place and size on the 840 px device.

`make meter` renders them with a local browser that has WebGL from the scene in `tools/meter/`, on the Mac, through
`heavy`. The wood grain's random numbers use a fixed seed, so rendering again at the same commit writes the same
files. The images are committed in `src/assets/meter/`, as the room's baked assets are (ADR-0004), and CI never
renders them. Changing the scene means rendering again and committing the new files on purpose, since each set
adds history.

The key words (PREV, ROOM, NEXT, START) are the content module's (`ui.keyPrev`, `ui.keyRoom`, `ui.keyNext`,
`ui.keyStart`), so the site's copy stays in one place. The render reads them from there and the scene holds none,
which means a change to one of those words needs a new render.
