import { useState } from "react";
import { EFFECT_LIST } from "../../lib/effects";
import EffectTile from "./EffectTile";

export default function EffectsPanel({
  effectId, setEffectId, effectIntensity, setEffectIntensity,
  applyFilterAll,
  bare = false, subtitle = "Color grading and atmosphere applied across all images.",
}) {
  const [filterTab, setFilterTab] = useState("all"); // "all" | "grade" | "fx"
  const active = effectId && effectId !== "none";

  const displayedEffects = EFFECT_LIST.filter((fx) => {
    if (filterTab === "all") return true;
    if (filterTab === "grade") return fx.group === "grade" || fx.id === "none";
    if (filterTab === "fx") return fx.group !== "grade" || fx.id === "none";
    return true;
  });

  const [appliedAll, setAppliedAll] = useState(false);

  const handleApplyAll = () => {
    if (applyFilterAll) {
      applyFilterAll(effectId, effectIntensity);
      setAppliedAll(true);
      setTimeout(() => setAppliedAll(false), 2400);
    }
  };

  const body = (
    <>
      <div className="filter-category-tabs">
        <button
          type="button"
          className={`filter-cat-btn ${filterTab === "all" ? "is-active" : ""}`}
          onClick={() => setFilterTab("all")}
        >
          All Filters (الكل)
        </button>
        <button
          type="button"
          className={`filter-cat-btn ${filterTab === "grade" ? "is-active" : ""}`}
          onClick={() => setFilterTab("grade")}
        >
          Color Grading (فلاتر ألوان)
        </button>
        <button
          type="button"
          className={`filter-cat-btn ${filterTab === "fx" ? "is-active" : ""}`}
          onClick={() => setFilterTab("fx")}
        >
          Atmosphere (خامات ومؤثرات)
        </button>
      </div>

      <div className="trgrid" style={{ marginTop: 10 }}>
        {displayedEffects.map((fx) => (
          <EffectTile
            key={fx.id}
            fx={fx}
            on={effectId === fx.id}
            onClick={() => setEffectId(fx.id)}
          />
        ))}
      </div>

      <label className="trdur" style={{ marginTop: 14, opacity: active ? 1 : 0.5 }}>
        <span>Filter Intensity (قوة الفلتر)</span>
        <input
          type="range" min={0} max={1} step={0.05} value={effectIntensity}
          disabled={!active}
          onChange={(e) => setEffectIntensity(+e.target.value)}
        />
        <span className="trdur__val">{Math.round(effectIntensity * 100)}%</span>
      </label>

      {active && (
        <div className="filter-actions-row">
          <button
            type="button"
            className="filter-apply-all-btn"
            onClick={handleApplyAll}
            title="Enforce this color filter across all clips"
          >
            ✓ Apply to All Images / تطبيق على كل الصور
          </button>
          <button
            type="button"
            className="filter-reset-btn"
            onClick={() => setEffectId("none")}
            title="Reset filter to normal"
          >
            Reset (إزالة)
          </button>
        </div>
      )}

      {appliedAll && (
        <div className="template-success-msg" style={{ marginTop: 8 }}>
          ✓ Filter applied to all storyboard images &amp; clips! / تم تطبيق الفلتر على كل الصور
        </div>
      )}
    </>
  );

  if (bare) return body;

  return (
    <div className="panel">
      <h2 className="panel__h">Color Filters &amp; Atmosphere</h2>
      <div className="mini-h">{subtitle}</div>
      {body}
    </div>
  );
}
