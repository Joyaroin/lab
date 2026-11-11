import type { Content } from "./content";
import { escapeHtml } from "./page-html";

/** The link preview image's URL: a file in public/, so its name is not hashed and its absolute URL is stable. `make og-image` writes it. */
export const IMAGE_URL = "https://lab.mediasafe.space/og-image.png";
/** The image's size in pixels. The test reads the committed file's PNG header and checks it matches. */
export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 630;

const og = (key: string, value: string | number) => `<meta property="${key}" content="${escapeHtml(String(value))}" />`;

/** The head tags for the link preview image (og:image and its size and alt text). */
export const imageTags = (c: Content): string[] => [
  og("og:image", IMAGE_URL),
  og("og:image:width", IMAGE_WIDTH),
  og("og:image:height", IMAGE_HEIGHT),
  og("og:image:alt", c.identity.imageAlt),
];
