import { useState } from "react";

export default function LeftPanel({ tabs, activeTab, onTabChange, isExpanded, onToggleExpand }) {
  const [internalActive, setInternalActive] = useState(tabs[0] ? tabs[0].id : null);
  const active = activeTab !== undefined ? activeTab : internalActive;
  const setActive = (id) => {
    if (onTabChange) onTabChange(id);
    setInternalActive(id);
  };
  const current = tabs.find((t) => t.id === active) || tabs[0];

  return (
    <div className="leftpanel">
      <div className="tabs" role="tablist" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <div style={{ display: "flex", gap: 3, overflowX: "auto", flex: 1, scrollbarWidth: "none" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === active}
              className={`tab ${t.id === active ? "is-on" : ""}`}
              onClick={() => setActive(t.id)}
              title={t.title || t.label}
            >
              {t.icon && <span className="tab__icon">{t.icon}</span>}
              <span className="tab__lbl">{t.label}</span>
            </button>
          ))}
        </div>
        {onToggleExpand && (
          <button
            type="button"
            className="tab-expand-btn"
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse settings frame / تصغير الإطار" : "Expand settings frame / تكبير إطار الإعدادات"}
            style={{
              flexShrink: 0,
              padding: "4px 8px",
              borderRadius: 7,
              border: "1px solid var(--line)",
              background: isExpanded ? "rgba(0, 245, 155, 0.15)" : "var(--panel)",
              color: isExpanded ? "var(--accent)" : "var(--muted)",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {isExpanded ? "⤡ Standard" : "⤢ Expand"}
          </button>
        )}
      </div>
      <div className="tabpanel" role="tabpanel">
        {current ? current.node : null}
      </div>
    </div>
  );
}
