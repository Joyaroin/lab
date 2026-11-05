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
