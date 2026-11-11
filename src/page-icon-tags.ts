import type { Content } from "./content";

/** The head's icon links (favicon, apple-touch-icon). The PNGs are public/favicon.png and public/apple-touch-icon.png, made by `make favicon`. */
export const iconTags = (_c: Content): string[] => [
  '<link rel="icon" type="image/png" sizes="48x48" href="/favicon.png">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
];
