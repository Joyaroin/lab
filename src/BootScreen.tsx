import { identity } from "./content";

export type Step = { label: string; done: boolean };

// Progress is the share of real load steps finished (capability check, room code, scene).
// It covers the room while it loads; when `fading`, it fades out over the room as the desk
// meter powers on (App.tsx), so the two read as one moment.
export function BootScreen({ steps, fading = false }: { steps: Step[]; fading?: boolean }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <main style={{
      position: "fixed", inset: 0, zIndex: 30, padding: "12vh 8vw", background: "#05080a",
      opacity: fading ? 0 : 1, transition: "opacity 0.7s ease-in", pointerEvents: fading ? "none" : "auto",
    }}>
      <h1 style={{ margin: 0, fontSize: "clamp(2rem, 6vw, 4rem)" }}>{identity.name}</h1>
      <p style={{ margin: "0.5rem 0 2rem", fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>{identity.title}</p>
      <progress aria-label="Load progress" max={steps.length} value={done} style={{ marginTop: "2rem" }} />
      <pre aria-label="Boot log" style={{ margin: "1rem 0 0", opacity: 0.8 }}>
        {steps.map((s) => `[ ${s.done ? "ok" : ".."} ] ${s.label}`).join("\n")}
        {fading ? "\n[ ok ] meter power-on" : ""}
      </pre>
    </main>
  );
}
