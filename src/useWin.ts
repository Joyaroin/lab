import { useEffect, useState } from "react";

/** The window's size, read again on every resize. Everything placed by the rules in src/pin.ts follows it. */
export function useWin() {
  const [win, setWin] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const read = () => setWin((w) => (w.width === window.innerWidth && w.height === window.innerHeight ? w : { width: window.innerWidth, height: window.innerHeight }));
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return win;
}
