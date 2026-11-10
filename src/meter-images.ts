import { useSyncExternalStore } from "react";
import { layerFiles } from "./meter-layers";

// The device's images are files of their own (vite.config.ts keeps them out of the script), asked for while the boot
// screen is up. `useMeterImages` says where that stands: until they have all arrived, and for good if one fails,
// the bar draws its plain text digits and buttons.
const urls = import.meta.glob("./assets/meter/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

/** The URL of one image of src/assets/meter/, by its file name. */
export const meterUrl = (file: string): string => urls[`./assets/meter/${file}`];

export type MeterImages = "loading" | "ready" | "failed";

let state: MeterImages = "loading";
let started = false;
const held: HTMLImageElement[] = []; // kept, so the browser keeps them decoded for the bar's own <img>s
const listeners = new Set<() => void>();
const set = (s: MeterImages) => { state = s; listeners.forEach((l) => l()); };

/** Asks for every image, once. Safe to call again. */
export function preloadMeterImages(): void {
  if (started) return;
  started = true;
  Promise.all(layerFiles().map((f) => {
    const img = new Image();
    held.push(img);
    img.src = meterUrl(f);
    return img.decode();
  })).then(() => set("ready"), () => set("failed"));
}

export function useMeterImages(): MeterImages {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}
