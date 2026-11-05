import { identity } from "./content";

export type Step = { label: string; done: boolean };

// Progress is the share of real load steps finished (capability check, room code, scene).
// The meter lives in the room, so it is not shown here.
export function BootScreen({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <main style={{ padding: "12vh 8vw" }}>
      <h1 style={{ margin: 0, fontSize: "clamp(2rem, 6vw, 4rem)" }}>{identity.name}</h1>
      <p style={{ margin: "0.5rem 0 2rem", fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>{identity.title}</p>
      <progress aria-label="Load progress" max={steps.length} value={done} style={{ marginTop: "2rem" }} />
      <pre aria-label="Boot log" style={{ margin: "1rem 0 0", opacity: 0.8 }}>
        {steps.map((s) => `[ ${s.done ? "ok" : ".."} ] ${s.label}`).join("\n")}
      </pre>
    </main>
  );
}
