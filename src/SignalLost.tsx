import type { FailureReason } from "./capability";
import { fill, identity, links, ui } from "./content";

export function SignalLost({ reason }: { reason: FailureReason }) {
  return (
    <main role="alert" aria-labelledby="sl-title" style={{ padding: "12vh 8vw" }}>
      <p id="sl-title" style={{ margin: 0, letterSpacing: "0.2em" }}>{ui.signalLost}</p>
      <h1 style={{ margin: "1rem 0 0", fontSize: "clamp(2rem, 6vw, 4rem)" }}>{identity.name}</h1>
      <p style={{ margin: "0.5rem 0 2rem", fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>{identity.title}</p>
      <p style={{ opacity: 0.8 }}>{fill(ui.signalLostReason, { reason })}</p>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", gap: "1.5rem" }}>
        {links.map((l) => (
          <li key={l.label}><a href={l.href} style={{ color: "inherit" }}>{l.label}</a></li>
        ))}
      </ul>
    </main>
  );
}
