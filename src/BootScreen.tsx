import { identity, bootLog } from "./content";

// The first screen. Static text only: nothing here waits on a large asset.
export function BootScreen() {
  return (
    <main style={{ padding: "12vh 8vw" }}>
      <h1 style={{ margin: 0, fontSize: "clamp(2rem, 6vw, 4rem)" }}>{identity.name}</h1>
      <p style={{ margin: "0.5rem 0 2rem", fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>
        {identity.title}
      </p>
      <pre aria-label="Boot log" style={{ margin: 0, opacity: 0.8 }}>
        {bootLog.join("\n")}
      </pre>
    </main>
  );
}
