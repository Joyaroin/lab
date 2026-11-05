// Identity and links for the boot screen and signal lost. Station content comes later.
// The name and title are also written into index.html so they show before any script runs:
// keep the two in step (a test checks this).
export const identity = {
  name: "Adham Sedik",
  title: "SWE & Platform",
};

// The résumé PDF is added at launch (#12).
export const links = [
  { label: "Résumé", href: "/resume.pdf" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/adham-sedik" },
  { label: "GitHub", href: "https://github.com/Joyaroin" },
];

// Placeholder stations, in tour order. Real station text comes in a later, reviewed PR.
// `reading` is each station's fixed meter reading: arbitrary, and not a number from the series.
export const stations = [
  { id: "work", name: "Work", worldLine: "World line 01", reading: 214 },
  { id: "mediasafe", name: "MediaSafe", worldLine: "World line 02", reading: 377 },
  { id: "home-lab", name: "Home lab", worldLine: "World line 03", reading: 512 },
  { id: "order-tracker", name: "Order Tracker", worldLine: "World line 04", reading: 640 },
  { id: "wc2026-predictor", name: "wc2026-predictor", worldLine: "World line 05", reading: 733 },
  { id: "contact", name: "Contact", worldLine: "World line 06", reading: 861 },
];
