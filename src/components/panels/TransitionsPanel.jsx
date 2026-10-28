import { useCallback, useState, useMemo } from "react";
import { tc } from "../../lib/format";
import {
  TRANSITION_LIST, transitionOf,
  MIN_TRANSITION_DURATION, MAX_TRANSITION_DURATION,
  TRANSITION_CATEGORIES, TRENDING_AUTOMATION_PICKS,
} from "../../lib/transitions";
import TransitionTile from "./TransitionTile";

export default function TransitionsPanel({
  clips, selectedIndex, selectedClip, selectedImageNum,
  currentType, pickType,
  transitionDuration, setTransitionDuration,
  applyTransitionAll, applyTransitionMix,
}) {
  const [mixMode, setMixMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [mixPicks, setMixPicks] = useState(() => new Set(TRENDING_AUTOMATION_PICKS));

  const toggleMix = useCallback((id) => {
    setMixPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const displayedTransitions = useMemo(() => {
    if (activeCategory === "all") return TRANSITION_LIST;
    return TRANSITION_LIST.filter((tr) => tr.category === activeCategory);
  }, [activeCategory]);

  const handleApplyViralMix = useCallback(() => {
    if (applyTransitionMix && clips && clips.length) {
      applyTransitionMix(TRENDING_AUTOMATION_PICKS, clips.map((c) => c.name));
    }
  }, [applyTransitionMix, clips]);

  return (
    <div className="panel transitions">
      <div className="transitions__head">
        <div className="transitions__titlerow">
          <span className="panel__h">Transitions / الانتقالات</span>
          <button
            type="button"
            className={`cap-switch ${mixMode ? "is-on" : ""}`}
            onClick={() => setMixMode((v) => !v)}
            aria-pressed={mixMode}
            title="Randomly apply a custom set of transitions across all cuts"
          >
            <span className="cap-switch__box" />
            Random mix
          </button>
        </div>
        <span className="transitions__target">
          {selectedIndex > 0
            ? `Into image ${selectedImageNum || "—"} · ${tc(selectedClip.start)}`
            : selectedIndex === 0
              ? "First image — no incoming transition"
              : "Tap a ◇ cut above to set its transition"}
        </span>
      </div>

      {/* 🔥 1-Click Viral Trend Mix Button */}
      <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleApplyViralMix}
          className="uyns-btn"
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(245, 158, 11, 0.2))",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            color: "#fbbf24",
            fontWeight: 800,
            fontSize: "12px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            cursor: "pointer",
          }}
          title="تطبيق خلطة انتقالات الترند الموصى بها على كافة مشاهد الفيديو"
        >
          <span>🔥</span>
          <span>تطبيق خلطة الترند على الفيديو (Viral Automation Mix)</span>
        </button>
      </div>

      {/* Category Filter Tabs */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {TRANSITION_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            style={{
              padding: "4px 9px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: activeCategory === cat.id ? "800" : "500",
              background: activeCategory === cat.id ? "#3b82f6" : "var(--panel-2)",
              color: activeCategory === cat.id ? "#ffffff" : "var(--muted)",
              border: "1px solid var(--line)",
              cursor: "pointer",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="trgrid">
        {displayedTransitions.map((tr) => (
          <TransitionTile
            key={tr.id}
            tr={tr}
            on={mixMode ? mixPicks.has(tr.id) : currentType === tr.id}
            onClick={() => (mixMode ? toggleMix(tr.id) : pickType(tr.id))}
          />
        ))}
      </div>

      {/* Duration Control & Automation Quick Speed Presets */}
      <div style={{ marginTop: 12 }}>
        <label className="trdur">
          <span>Duration / سرعة الانتقال</span>
          <input
            type="range" min={MIN_TRANSITION_DURATION} max={MAX_TRANSITION_DURATION} step={0.05}
            value={transitionDuration}
            onChange={(e) => setTransitionDuration(+e.target.value)}
          />
          <span className="trdur__val">{transitionDuration.toFixed(2)}s</span>
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {[
            [0.25, "⚡ 0.25s Shorts"],
            [0.35, "🔥 0.35s Viral Trend"],
            [0.50, "🎬 0.50s Docu Essay"],
          ].map(([spd, lbl]) => (
            <button
              key={lbl}
              type="button"
              onClick={() => setTransitionDuration(spd)}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 4,
                border: Math.abs(transitionDuration - spd) < 0.03 ? "1px solid #3b82f6" : "1px solid var(--line)",
                background: Math.abs(transitionDuration - spd) < 0.03 ? "rgba(59, 130, 246, 0.2)" : "var(--panel-2)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {!mixMode ? (
        <button
          type="button" className="trall"
          style={{ marginTop: 14 }}
          onClick={() => applyTransitionAll(currentType, clips.map((c) => c.name))}
        >
          Apply “{transitionOf(currentType).label}” to all cuts
        </button>
      ) : (
        <div className="trmix-foot" style={{ marginTop: 14 }}>
          <span className="trmix-count">
            {mixPicks.size ? `Picked ${mixPicks.size}` : "None picked"}
          </span>
          <button
            type="button" className="trall trmix-apply"
            disabled={mixPicks.size === 0}
            onClick={() => applyTransitionMix([...mixPicks], clips.map((c) => c.name))}
          >
            Apply custom mix to video
          </button>
        </div>
      )}
    </div>
  );
}
