/**
 * Ambient confetti layer for the hero's empty text column when a real event
 * photo occupies the other half. Pieces are hardcoded (position/colour/
 * timing) rather than randomised — a server/client render of Math.random()
 * would mismatch and trigger a hydration error.
 */
const PIECES = [
  { left: "8%", size: 8, tall: 3, shape: "rect" as const, color: "var(--pv-lime)", opacity: 0.55, duration: "5.5s", delay: "0s" },
  { left: "22%", size: 3, tall: 10, shape: "rect" as const, color: "var(--pv-ink)", opacity: 0.35, duration: "6.2s", delay: "1.1s" },
  { left: "40%", size: 6, tall: 6, shape: "circle" as const, color: "var(--event-accent, var(--pv-lime))", opacity: 0.5, duration: "4.8s", delay: "2.3s" },
  { left: "58%", size: 8, tall: 3, shape: "rect" as const, color: "var(--pv-lime)", opacity: 0.45, duration: "5.9s", delay: "0.6s" },
  { left: "74%", size: 3, tall: 9, shape: "rect" as const, color: "var(--pv-ink)", opacity: 0.3, duration: "5.1s", delay: "1.8s" },
  { left: "88%", size: 6, tall: 6, shape: "circle" as const, color: "var(--event-accent, var(--pv-lime))", opacity: 0.4, duration: "6.6s", delay: "0.3s" },
  { left: "15%", size: 7, tall: 3, shape: "rect" as const, color: "var(--pv-ink)", opacity: 0.25, duration: "5.3s", delay: "3.1s" },
  { left: "66%", size: 7, tall: 3, shape: "rect" as const, color: "var(--pv-lime)", opacity: 0.35, duration: "4.6s", delay: "2.7s" },
];

export function ConfettiField() {
  return (
    <div className="pv-confetti" aria-hidden="true">
      {PIECES.map((piece, index) => (
        <span
          key={index}
          className="pv-confetti__piece"
          style={{
            left: piece.left,
            width: piece.size,
            height: piece.shape === "circle" ? piece.size : piece.tall,
            borderRadius: piece.shape === "circle" ? "50%" : undefined,
            background: piece.color,
            animationDuration: piece.duration,
            animationDelay: piece.delay,
            ["--piece-opacity" as string]: piece.opacity,
          }}
        />
      ))}
    </div>
  );
}
