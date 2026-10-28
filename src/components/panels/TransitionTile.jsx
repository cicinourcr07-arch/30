import { useEffect, useRef } from "react";
import { transitionOf } from "../../lib/transitions";
import { sceneCanvas } from "./sampleScene";

const REST_P = 0.5;      // static frame shown at rest
const LOOP_MS = 1100;    // one A→B pass on hover

// One square transition tile: draws a real mini-preview using the SAME painter
// the editor/export use, so it matches the result. Blends between two sample
// scenes (day -> sunset) so the motion reads. Static mid-frame at rest; loops
// the A→B animation while hovered.
export default function TransitionTile({ tr, t, on, active, onClick, onPick }) {
  const item = tr || t || { id: "fade", label: "Fade" };
  const isSelected = on ?? active ?? false;
  const handleClick = onClick || onPick;
  const ref = useRef(null);
  const rafRef = useRef(0);

  const paintAt = (p) => {
    const cv = ref.current;
    if (!cv) return;
    const from = sceneCanvas("dark"), to = sceneCanvas("silver");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const cp = Math.max(0, Math.min(1, p)); // guard painters that use p as a radius/clip
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (from && to) transitionOf(item.id).canvas(ctx, from, to, cp, W, H, 1, 1);
  };

  useEffect(() => { paintAt(REST_P); return () => cancelAnimationFrame(rafRef.current); }, [item.id]);

  const start = () => {
    cancelAnimationFrame(rafRef.current);
    const t0 = performance.now();
    const step = (t) => {
      const el = Math.max(0, t - t0); // rAF's timestamp can be just before t0
      paintAt((el % LOOP_MS) / LOOP_MS);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };
  const stop = () => { cancelAnimationFrame(rafRef.current); paintAt(REST_P); };

  return (
    <button
      type="button"
      className={`trtile ${isSelected ? "is-on" : ""}`}
      onClick={handleClick}
      onPointerEnter={start}
      onPointerLeave={stop}
      title={`${item.label}${item.labelAr ? " / " + item.labelAr : ""}`}
      style={{ position: "relative" }}
    >
      {item.badge && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            fontSize: "9px",
            fontWeight: "800",
            padding: "2px 5px",
            borderRadius: "4px",
            background: item.badge.includes("TREND") ? "#ef4444" : "rgba(30, 41, 59, 0.85)",
            color: "#ffffff",
            letterSpacing: "0.5px",
            zIndex: 2,
            boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
          }}
        >
          {item.badge}
        </span>
      )}
      <canvas ref={ref} width={140} height={140} className="trtile__cv" />
      <span className="trtile__label">{item.label}</span>
    </button>
  );
}
