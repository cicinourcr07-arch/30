import { useCallback, useRef, useState } from "react";
import {
  CAPTION_STYLE_LIST, CAPTION_SIZES, captionLineHeightDefault,
  CAPTION_FONTS, captionFontFamily, captionPosPct as posPct,
  CAPTION_PRESET_COLORS, CAPTION_ANIMATIONS, CAPTION_VIRAL_PRESETS,
  OVERLAY_CATEGORIES, OVERLAY_STYLES, OVERLAY_ANIMATIONS, generateHeuristicOverlays,
} from "../../lib/captions";
import CaptionStyleTile from "./CaptionStyleTile";

function formatSec(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1);
  return `${m}:${rem.padStart(4, "0")}`;
}

export default function CaptionsPanel({
  captionCues, captionsOn, setCaptionsOn,
  captionStyle, setCaptionStyle,
  captionColor = "#FFFFFF", setCaptionColor,
  captionAnimation = "pop", setCaptionAnimation,
  captionSize, setCaptionSize,
  captionLineHeight, setCaptionLineHeight,
  captionFontScale, setCaptionFontScale,
  captionFont, setCaptionFont,
  captionPosition, setCaptionPosition,
  captionName, captionError, onCaptionFile,
  // AI Auto Caption Effects props
  captionEffects = [], setCaptionEffects,
  captionEffectsOn = true, setCaptionEffectsOn,
  onSeek,
  currentTime = 0,
  selectedOverlayId, setSelectedOverlayId,
}) {
  const capInputRef = useRef(null);
  const [activeSubTab, setActiveSubTab] = useState("effects"); // "subtitles" | "effects"
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState(null);
  const [genError, setGenError] = useState(null);
  const [catFilter, setCatFilter] = useState("all");
  const [editingOverlay, setEditingOverlay] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    text: "WOW!",
    category: "reaction",
    animation: "spring_bounce",
    style: "beast",
    color: "#FFE600",
    position: "auto",
    emoji: "💥",
    start: 0,
    end: 2,
  });

  const onPickCaption = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file && onCaptionFile) onCaptionFile(file);
    e.target.value = "";
  }, [onCaptionFile]);

  const applyViralPreset = (pr) => {
    if (pr.style && setCaptionStyle) setCaptionStyle(pr.style);
    if (pr.animation && setCaptionAnimation) setCaptionAnimation(pr.animation);
    if (pr.color && setCaptionColor) setCaptionColor(pr.color);
    if (pr.font && setCaptionFont) setCaptionFont(pr.font);
    if (pr.size && setCaptionSize) {
      setCaptionSize(pr.size);
      if (setCaptionFontScale) setCaptionFontScale(null);
    }
    if (pr.position != null && setCaptionPosition) setCaptionPosition(pr.position);
  };

  // Generate AI Text Effects by calling the backend endpoint with fallback to heuristics
  const handleGenerateAiEffects = async () => {
    if (!captionCues || captionCues.length === 0) {
      setGenError("يرجى رفع ملف ترجمة SRT أو VTT أولاً / Please upload an SRT or VTT caption file first.");
      return;
    }
    setGenerating(true);
    setGenError(null);
    setGenStatus("جاري تحليل النصوص واكتشاف اللحظات الفايرال بالذكاء الاصطناعي... / Analyzing transcript moments with AI...");

    try {
      const res = await fetch("/api/ai/caption-effects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cues: captionCues }),
      });

      let results = [];
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.overlays) && data.overlays.length > 0) {
          results = data.overlays;
        }
      }

      // If backend didn't return overlays or was unavailable, use smart client-side heuristic engine
      if (!results || results.length === 0) {
        results = generateHeuristicOverlays(captionCues);
      }

      if (results && results.length > 0) {
        if (setCaptionEffects) setCaptionEffects(results);
        if (setCaptionEffectsOn) setCaptionEffectsOn(true);
        setGenStatus(`تم توليد ${results.length} مؤثر نصي تلقائي احترافي بنجاح! / Generated ${results.length} viral visual text effects!`);
        setActiveSubTab("effects");
      } else {
        setGenError("لم يتم العثور على لحظات كافية للتأثيرات في النص / No suitable caption moments found.");
      }
    } catch (err) {
      // Robust fallback to local heuristics on any network failure
      const fallback = generateHeuristicOverlays(captionCues);
      if (fallback && fallback.length > 0) {
        if (setCaptionEffects) setCaptionEffects(fallback);
        if (setCaptionEffectsOn) setCaptionEffectsOn(true);
        setGenStatus(`تم توليد ${fallback.length} مؤثر نصي بنجاح! / Generated ${fallback.length} text effects!`);
        setActiveSubTab("effects");
      } else {
        setGenError(err.message || "Failed to generate AI caption effects");
      }
    } finally {
      setGenerating(false);
      setTimeout(() => setGenStatus(null), 5000);
    }
  };

  const handleToggleApprove = (id) => {
    if (!setCaptionEffects) return;
    setCaptionEffects((prev) =>
      (prev || []).map((o) => (o.id === id ? { ...o, approved: !o.approved } : o))
    );
  };

  const handleApproveAll = () => {
    if (!setCaptionEffects) return;
    setCaptionEffects((prev) => (prev || []).map((o) => ({ ...o, approved: true })));
  };

  const handleDisableAll = () => {
    if (!setCaptionEffects) return;
    setCaptionEffects((prev) => (prev || []).map((o) => ({ ...o, approved: false })));
  };

  const handleDeleteOverlay = (id) => {
    if (!setCaptionEffects) return;
    setCaptionEffects((prev) => (prev || []).filter((o) => o.id !== id));
    if (selectedOverlayId === id && setSelectedOverlayId) setSelectedOverlayId(null);
  };

  const handleClearAll = () => {
    if (window.confirm("هل أنت متأكد من حذف جميع مؤثرات النصوص؟ / Clear all text effects?")) {
      if (setCaptionEffects) setCaptionEffects([]);
      if (setSelectedOverlayId) setSelectedOverlayId(null);
    }
  };

  const openEditModal = (ov) => {
    setEditingOverlay({ ...ov });
  };

  const saveEditingOverlay = () => {
    if (!editingOverlay || !setCaptionEffects) return;
    setCaptionEffects((prev) =>
      (prev || []).map((o) => (o.id === editingOverlay.id ? { ...editingOverlay } : o))
    );
    setEditingOverlay(null);
  };

  const openAddCustom = () => {
    const cur = Number(currentTime) || 0;
    setAddForm({
      text: "WOW!",
      category: "reaction",
      animation: "spring_bounce",
      style: "beast",
      color: "#FFE600",
      position: "auto",
      emoji: "💥",
      start: +cur.toFixed(2),
      end: +(cur + 1.8).toFixed(2),
    });
    setShowAddForm(true);
  };

  const saveNewOverlay = () => {
    if (!addForm.text || !setCaptionEffects) return;
    const newOv = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...addForm,
      approved: true,
    };
    setCaptionEffects((prev) => [...(prev || []), newOv].sort((a, b) => a.start - b.start));
    setShowAddForm(false);
    if (onSeek) onSeek(newOv.start);
  };

  // Filtered overlays list
  const filteredOverlays = (captionEffects || []).filter((o) => {
    if (catFilter === "all") return true;
    return o.category === catFilter;
  });

  const approvedCount = (captionEffects || []).filter((o) => o.approved !== false).length;

  return (
    <>
      <div className="panel captions" style={{ width: "100%", overflowX: "hidden" }}>
        <h2 className="panel__h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Captions & AI Effects / نصوص ومؤثرات الفيديو</span>
          <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>YouTube Trend Edition</span>
        </h2>

        {/* Global SRT / VTT Upload & Replace Header */}
        {!(captionCues && captionCues.length) ? (
          <div className="cap-empty" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className="cap-upload"
              onClick={() => capInputRef.current && capInputRef.current.click()}
            >
              <span className="cap-upload__i">⤒</span> Upload SRT / VTT Script
            </button>
            <p className="cap-hint">
              An <code>.srt</code>, <code>.vtt</code>, or timestamped <code>.txt</code> file. Captions sync to voiceover, burn into MP4, and power <b>AI Auto Caption Effects</b>.
            </p>
            {captionError && <div className="note note--bad">{captionError}</div>}
          </div>
        ) : (
          <div className="cap-bar" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`cap-switch ${captionsOn ? "is-on" : ""}`}
              onClick={() => setCaptionsOn(!captionsOn)}
              aria-pressed={captionsOn}
              title="Toggle base subtitle track"
            >
              <span className="cap-switch__box" />
              {captionsOn ? "Subtitles On" : "Subtitles Off"}
            </button>
            <span className="cap-meta">
              <span className="cap-meta__name">{captionName || "captions.srt"}</span>
              {captionCues.length} cues ·{" "}
              <button
                type="button"
                className="cap-replace"
                onClick={() => capInputRef.current && capInputRef.current.click()}
              >
                replace
              </button>
            </span>
          </div>
        )}

        {/* Sub-Tabs: Subtitles Track vs. AI Auto Text Effects */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "var(--panel-2)", padding: 4, borderRadius: 10 }}>
          <button
            type="button"
            onClick={() => setActiveSubTab("effects")}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: activeSubTab === "effects" ? "rgba(0, 245, 155, 0.2)" : "transparent",
              color: activeSubTab === "effects" ? "var(--accent)" : "var(--muted)",
              transition: "all 0.15s ease",
            }}
          >
            <span>⚡ AI Text Effects (تراند يوتيوب)</span>
            {captionEffects && captionEffects.length > 0 && (
              <span style={{
                background: "var(--accent)",
                color: "#000",
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 999,
                fontWeight: 900,
              }}>
                {captionEffects.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("subtitles")}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: activeSubTab === "subtitles" ? "rgba(59, 130, 246, 0.2)" : "transparent",
              color: activeSubTab === "subtitles" ? "#60a5fa" : "var(--muted)",
              transition: "all 0.15s ease",
            }}
          >
            <span>📝 Subtitles Style (شريط الترجمة)</span>
          </button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: AI AUTO CAPTION EFFECTS (TRENDING YOUTUBE AUTOMATION) */}
        {/* ------------------------------------------------------------- */}
        {activeSubTab === "effects" && (
          <div className="cap-effects-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Master Control Bar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              background: "var(--panel-2)",
              borderRadius: 12,
              border: "1px solid var(--line)",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text-pure)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⚡ AI Viral Overlays / نصوص وتراندات اليوتيوب</span>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(0, 245, 155, 0.15)", color: "var(--accent)", fontWeight: 900 }}>
                    3D Hooks
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  مؤثرات بصرية حركية بأسلوب MrBeast, Hormozi, Vox حسب تحليل المشهد والصورة
                </div>
              </div>
              <button
                type="button"
                className={`cap-switch ${captionEffectsOn ? "is-on" : ""}`}
                onClick={() => setCaptionEffectsOn && setCaptionEffectsOn(!captionEffectsOn)}
                aria-pressed={captionEffectsOn}
                title="Toggle AI Text Effects display"
              >
                <span className="cap-switch__box" />
                {captionEffectsOn ? "Active" : "Muted"}
              </button>
            </div>

            {/* Hero CTA Button: Generate AI Text Effects */}
            <div>
              <button
                type="button"
                disabled={generating || !(captionCues && captionCues.length)}
                onClick={handleGenerateAiEffects}
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: (captionCues && captionCues.length)
                    ? "linear-gradient(135deg, #00f59b 0%, #00e5ff 100%)"
                    : "var(--panel-2)",
                  color: (captionCues && captionCues.length) ? "#04140e" : "var(--muted)",
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: (captionCues && captionCues.length) ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: (captionCues && captionCues.length) ? "0 4px 18px rgba(0, 245, 155, 0.35)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                {generating ? (
                  <>
                    <span className="importing__spin" style={{ width: 16, height: 16 }} />
                    <span>Analyzing captions & image scenes with AI...</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 18 }}>⚡</span>
                    <span>Generate AI Text Effects / توليد مؤثرات النصوص الذكية</span>
                  </>
                )}
              </button>
              {!(captionCues && captionCues.length) && (
                <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 8, textAlign: "center", background: "rgba(255, 107, 0, 0.1)", padding: "6px 10px", borderRadius: 8 }}>
                  💡 يرجى رفع ملف ترجمة SRT/VTT أعلاه لتوليد مؤثرات تراند تلقائياً
                </div>
              )}
            </div>

            {/* Status Messages */}
            {genStatus && (
              <div className="note" style={{ background: "rgba(0, 245, 155, 0.15)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
                ✓ {genStatus}
              </div>
            )}
            {genError && (
              <div className="note note--bad">
                ✕ {genError}
              </div>
            )}

            {/* Overlays List & Actions */}
            {captionEffects && captionEffects.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Stats & Actions Row */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--muted)",
                  padding: "6px 4px",
                }}>
                  <div>
                    <span><b>{captionEffects.length}</b> مؤثر مُنشأ</span>
                    <span style={{ margin: "0 6px" }}>·</span>
                    <span style={{ color: "var(--accent)" }}><b>{approvedCount}</b> مفعل</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={handleApproveAll}
                      style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(0, 245, 155, 0.15)", color: "var(--accent)", border: "1px solid rgba(0, 245, 155, 0.3)", fontSize: 11, cursor: "pointer", fontWeight: 800 }}
                    >
                      ✓ تفعيل الكل
                    </button>
                    <button
                      type="button"
                      onClick={handleDisableAll}
                      style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255, 255, 255, 0.05)", color: "var(--muted)", border: "1px solid var(--line)", fontSize: 11, cursor: "pointer" }}
                    >
                      تعطيل الكل
                    </button>
                    <button
                      type="button"
                      onClick={openAddCustom}
                      style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.4)", fontSize: 11, cursor: "pointer", fontWeight: 800 }}
                    >
                      + إضافة يدوي
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255, 51, 102, 0.1)", color: "var(--bad)", border: "1px solid rgba(255, 51, 102, 0.3)", fontSize: 11, cursor: "pointer" }}
                    >
                      مسح
                    </button>
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
                  <button
                    type="button"
                    onClick={() => setCatFilter("all")}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 20,
                      border: "none",
                      background: catFilter === "all" ? "var(--elev-hover)" : "var(--panel-2)",
                      color: catFilter === "all" ? "var(--text-pure)" : "var(--muted)",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    الكل ({captionEffects.length})
                  </button>
                  {OVERLAY_CATEGORIES.map((cat) => {
                    const count = captionEffects.filter((o) => o.category === cat.id).length;
                    if (count === 0) return null;
                    const active = catFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCatFilter(cat.id)}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 20,
                          border: active ? `1px solid ${cat.color}` : "1px solid transparent",
                          background: active ? `${cat.color}22` : "var(--panel-2)",
                          color: active ? cat.color : "var(--muted)",
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span>{cat.icon}</span>
                        <span>{cat.label.split("/")[0].trim()} ({count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Overlays Card List - Flowing naturally without restrictive clamp */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredOverlays.map((ov) => {
                    const isApproved = ov.approved !== false;
                    const catInfo = OVERLAY_CATEGORIES.find((c) => c.id === ov.category) || OVERLAY_CATEGORIES[0];
                    const styleInfo = OVERLAY_STYLES.find((s) => s.id === ov.style) || OVERLAY_STYLES[0];
                    const isSelected = selectedOverlayId === ov.id;
                    const duration = Math.max(0.4, (ov.end || ov.start + 1.2) - ov.start).toFixed(1);

                    return (
                      <div
                        key={ov.id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          background: isSelected ? "rgba(0, 245, 155, 0.08)" : "var(--panel-2)",
                          border: isSelected ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                          opacity: isApproved ? 1 : 0.55,
                          transition: "all 0.15s ease",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          if (onSeek) onSeek(ov.start);
                          if (setSelectedOverlayId) setSelectedOverlayId(ov.id);
                        }}
                      >
                        {/* Header bar: Checkbox + Tag + Timing */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={isApproved}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleApprove(ov.id);
                              }}
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent)" }}
                              title="تفعيل/تعطيل المؤثر في الفيديو"
                            />
                            <span style={{
                              fontSize: 11,
                              fontWeight: 900,
                              padding: "2px 7px",
                              borderRadius: 6,
                              background: `${catInfo.color}22`,
                              color: catInfo.color,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}>
                              <span>{ov.emoji || catInfo.icon}</span>
                              <span style={{ textTransform: "uppercase" }}>{ov.category}</span>
                            </span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--text-pure)",
                              background: "rgba(255,255,255,0.08)",
                              padding: "2px 6px",
                              borderRadius: 5,
                            }}>
                              {styleInfo.label.split("/")[0].trim()}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--teal-bright)", fontWeight: 800 }}>
                            {formatSec(ov.start)} - {formatSec(ov.end)} ({duration}s)
                          </span>
                        </div>

                        {/* Large 3D Viral Text Preview */}
                        <div style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: "rgba(0, 0, 0, 0.45)",
                          margin: "6px 0 10px 0",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}>
                          <span style={{ fontSize: 18 }}>{ov.emoji || catInfo.icon}</span>
                          <span style={{
                            fontSize: 16,
                            fontWeight: 900,
                            letterSpacing: "0.03em",
                            color: ov.color || catInfo.color,
                            textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
                          }}>
                            "{ov.text}"
                          </span>
                        </div>

                        {/* Card Footer: Metadata & Quick Actions */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--line-soft)" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--muted)" }}>
                            <span>تمركُز: <b>{ov.position === "auto" || ov.position == null ? "🤖 ذكي" : `${ov.position}%`}</b></span>
                            <span>·</span>
                            <span>حركة: <b>{ov.animation || "spring_bounce"}</b></span>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => onSeek && onSeek(ov.start)}
                              style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.08)", border: "1px solid var(--line)", color: "var(--text)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 700 }}
                              title="معاينة اللحظة في المشغل"
                            >
                              <span>▶ معاينة</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(ov)}
                              style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(59, 130, 246, 0.2)", border: "1px solid rgba(59, 130, 246, 0.4)", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
                              title="تعديل الستايل، الحجم، التمركز، واللون"
                            >
                              ✎ تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOverlay(ov.id)}
                              style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255, 51, 102, 0.12)", border: "1px solid rgba(255, 51, 102, 0.3)", color: "var(--bad)", fontSize: 11, cursor: "pointer" }}
                              title="حذف المؤثر"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{
                padding: "32px 20px",
                textAlign: "center",
                borderRadius: 14,
                background: "var(--panel-2)",
                border: "1px dashed var(--line)",
                color: "var(--muted)",
                fontSize: 13,
              }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>⚡</div>
                <div style={{ fontWeight: 900, color: "var(--text-pure)", fontSize: 15, marginBottom: 6 }}>
                  لم يتم توليد مؤثرات نصوص حتى الآن
                </div>
                <div style={{ fontSize: 12, maxWidth: 360, margin: "0 auto 16px auto", lineHeight: 1.5 }}>
                  انقر فوق "توليد مؤثرات النصوص الذكية" أعلاه لتحليل سيناريو المشاهد وإضافة نصوص 3D وهوكس أوتوماتيكياً كالمحترفين.
                </div>
                <button
                  type="button"
                  onClick={openAddCustom}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--elev)",
                    color: "var(--text-pure)",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  + إضافة مؤثر مخصص يدوياً
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: BASE SUBTITLES & STYLING (PRESERVED COMPLETE) */}
        {/* ------------------------------------------------------------- */}
        {activeSubTab === "subtitles" && (
          <div className="cap-body">
            {/* 1-Click Viral Presets Bar */}
            <div className="mini-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>🔥 قوالب ترند YouTube Automation (1-Click Presets)</span>
              <span style={{ fontSize: "10px", color: "#38bdf8", fontWeight: 700 }}>سريعة وجاهزة</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6, marginBottom: 14 }}>
              {CAPTION_VIRAL_PRESETS.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => applyViralPreset(pr)}
                  className="anim-chip"
                  style={{
                    padding: "8px 10px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    textAlign: "left",
                    borderRadius: "8px",
                    border: captionStyle === pr.style ? "1px solid #3b82f6" : "1px solid var(--line)",
                    background: captionStyle === pr.style ? "rgba(59, 130, 246, 0.15)" : "var(--panel-2)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title={pr.desc}
                >
                  <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-pure)" }}>{pr.nameAr}</span>
                  <span style={{ fontSize: "9px", color: "var(--muted)", marginTop: 2 }}>{pr.name}</span>
                </button>
              ))}
            </div>

            <div className="mini-h">Caption Animation / حركة الكتابة</div>
            <div className="anim-chips">
              {CAPTION_ANIMATIONS.map((an) => (
                <button
                  key={an.id}
                  type="button"
                  className={`anim-chip ${captionAnimation === an.id ? "is-on" : ""}`}
                  onClick={() => setCaptionAnimation && setCaptionAnimation(an.id)}
                  title={an.desc}
                >
                  <span className="anim-chip__label">{an.label}</span>
                </button>
              ))}
            </div>

            <div className="mini-h" style={{ marginTop: 14 }}>Caption Color / لون الكتابة</div>
            <div className="color-picker-row">
              <div className="color-swatches">
                {CAPTION_PRESET_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`color-swatch ${captionColor?.toLowerCase() === c.value.toLowerCase() ? "is-active" : ""}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setCaptionColor && setCaptionColor(c.value)}
                    title={c.label}
                    aria-label={c.label}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <label className="color-custom-btn" title="Choose custom color">
                  <input
                    type="color"
                    className="color-native-input"
                    value={/^#[0-9A-Fa-f]{6}$/.test(captionColor || "") ? captionColor : "#ffffff"}
                    onChange={(e) => setCaptionColor && setCaptionColor(e.target.value.toUpperCase())}
                  />
                  <span className="color-custom-tag" style={{ color: captionColor || "#ffffff" }}>
                    🎨 Custom
                  </span>
                </label>
                <input
                  type="text"
                  value={captionColor || "#FFFFFF"}
                  onChange={(e) => setCaptionColor && setCaptionColor(e.target.value)}
                  placeholder="#FFFFFF"
                  style={{
                    width: 90,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: "var(--panel-2)",
                    color: "var(--text)",
                    fontFamily: "monospace",
                    fontSize: 12,
                    textTransform: "uppercase",
                  }}
                />
              </div>
            </div>

            <div className="mini-h" style={{ marginTop: 14 }}>Style Preset</div>
            <div className="captiles">
              {CAPTION_STYLE_LIST.map((st) => (
                <CaptionStyleTile
                  key={st.id}
                  st={st}
                  color={captionColor}
                  fontFamily={captionFontFamily(captionFont)}
                  on={captionStyle === st.id}
                  onClick={() => setCaptionStyle(st.id)}
                />
              ))}
            </div>

            <div className="mini-h" style={{ marginTop: 14 }}>Font Family</div>
            <div className="transitions__chips">
              {CAPTION_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`trchip ${captionFont === f.id ? "is-on" : ""}`}
                  style={{ fontFamily: `"${f.family}", system-ui, sans-serif` }}
                  onClick={() => setCaptionFont(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="mini-h" style={{ marginTop: 16 }}>Vertical position (100% = top, 0% = bottom)</div>
            <div className="seg" style={{ flexWrap: "wrap", gap: 4 }}>
              {[
                [50, "Shorts Center (50%)"],
                [25, "🔥 Shorts Safe (25%)"],
                [12, "🎬 Doc Lower (12%)"],
                [0, "Bottom (0%)"],
                [100, "Top (100%)"],
              ].map(([v, lbl]) => (
                <button
                  key={lbl}
                  type="button"
                  className={Math.round(posPct(captionPosition)) === v ? "is-on" : ""}
                  onClick={() => setCaptionPosition(v)}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                >{lbl}</button>
              ))}
            </div>
            <label className="trdur">
              <input
                type="range" min={0} max={100} step={1}
                value={posPct(captionPosition)}
                onChange={(e) => setCaptionPosition(+e.target.value)}
              />
              <span className="trdur__val">{Math.round(posPct(captionPosition))}%</span>
            </label>

            <div className="mini-h" style={{ marginTop: 12 }}>Size</div>
            <div className="seg">
              {[["sm", "Small"], ["md", "Medium"], ["lg", "Large"]].map(([id, lbl]) => (
                <button
                  key={id}
                  type="button"
                  className={captionFontScale == null && captionSize === id ? "is-on" : ""}
                  onClick={() => { setCaptionSize(id); setCaptionFontScale && setCaptionFontScale(null); }}
                >{lbl}</button>
              ))}
            </div>

            <div className="mini-h" style={{ marginTop: 12 }}>Font size (fine-tune)</div>
            <label className="trdur">
              <input
                type="range" min={0.03} max={0.10} step={0.002}
                value={captionFontScale != null ? captionFontScale : (CAPTION_SIZES[captionSize] || CAPTION_SIZES.md)}
                onChange={(e) => setCaptionFontScale && setCaptionFontScale(+e.target.value)}
              />
              <span className="trdur__val">
                {Math.round((captionFontScale != null ? captionFontScale : (CAPTION_SIZES[captionSize] || CAPTION_SIZES.md)) * 1000) / 10}%
              </span>
            </label>
            {captionFontScale != null && (
              <button type="button" className="cap-replace" onClick={() => setCaptionFontScale && setCaptionFontScale(null)}>
                reset to preset
              </button>
            )}

            <div className="mini-h" style={{ marginTop: 12 }}>Line spacing (2-line captions)</div>
            <label className="trdur">
              <input
                type="range" min={1.0} max={2.2} step={0.05}
                value={captionLineHeight != null ? captionLineHeight : captionLineHeightDefault(captionStyle)}
                onChange={(e) => setCaptionLineHeight && setCaptionLineHeight(+e.target.value)}
              />
              <span className="trdur__val">
                {(captionLineHeight != null ? captionLineHeight : captionLineHeightDefault(captionStyle)).toFixed(2)}×
              </span>
            </label>
            {captionLineHeight != null && (
              <button type="button" className="cap-replace" onClick={() => setCaptionLineHeight && setCaptionLineHeight(null)}>
                Reset to default
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hidden File Input for SRT/VTT script */}
      <input
        ref={capInputRef} type="file" accept=".srt,.vtt,.txt,text/plain" hidden
        onChange={onPickCaption}
      />

      {/* ------------------------------------------------------------- */}
      {/* SPACIOUS MODAL: EDIT OVERLAY */}
      {/* ------------------------------------------------------------- */}
      {editingOverlay && (
        <div className="modal-backdrop" onClick={() => setEditingOverlay(null)}>
          <div className="modal" style={{ maxWidth: 620, width: "100%", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <span className="modal__title">تعديل مؤثر النص / Edit Viral Overlay</span>
              </div>
              <button className="modal__close" onClick={() => setEditingOverlay(null)} aria-label="Close">✕</button>
            </div>

            {/* Live Visual Badge Preview */}
            <div style={{
              padding: "20px 16px",
              borderRadius: 12,
              background: "radial-gradient(ellipse at center, rgba(30, 40, 60, 0.9) 0%, rgba(10, 14, 24, 0.98) 100%)",
              border: "1px solid var(--line)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}>
              <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Live Canvas Preview / المعاينة البصرية الحية
              </span>
              <div style={{
                padding: "10px 20px",
                borderRadius: editingOverlay.style === "cyber" ? 20 : (editingOverlay.style === "magnates" ? 8 : 12),
                background: editingOverlay.style === "beast" ? "#0c1017"
                  : (editingOverlay.style === "hormozi" ? "#000"
                  : (editingOverlay.style === "magnates" ? "#0a0806"
                  : (editingOverlay.style === "alert" ? "#160408" : "rgba(10,14,20,0.92)"))),
                border: `2px solid ${editingOverlay.color || (editingOverlay.style === "magnates" ? "#D4AF37" : (editingOverlay.style === "alert" ? "#FF1E56" : "#00FF66"))}`,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              }}>
                <span style={{ fontSize: 24 }}>{editingOverlay.emoji || "💥"}</span>
                <span style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: editingOverlay.color || "#FFE600",
                  textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
                  letterSpacing: "0.04em",
                }}>
                  {editingOverlay.text || "TEXT"}
                </span>
              </div>
            </div>

            {/* Inputs Grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 6 }}>
                  Overlay Text / نص المؤثر
                </label>
                <input
                  type="text"
                  value={editingOverlay.text}
                  onChange={(e) => setEditingOverlay({ ...editingOverlay, text: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--panel-2)",
                    color: "var(--text-pure)",
                    fontSize: 16,
                    fontWeight: 900,
                  }}
                />
              </div>

              {/* Visual Style Selector */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 6 }}>
                  Visual Style / نمط العرض الفايرال
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
                  {OVERLAY_STYLES.map((st) => {
                    const isCur = (editingOverlay.style || "beast") === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setEditingOverlay({ ...editingOverlay, style: st.id })}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: isCur ? "2px solid var(--accent)" : "1px solid var(--line)",
                          background: isCur ? "rgba(0, 245, 155, 0.15)" : "var(--panel-2)",
                          color: isCur ? "var(--accent)" : "var(--text)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 900 }}>{st.icon} {st.label.split("/")[0].trim()}</span>
                        <span style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{st.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Timing */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    Start (sec) / البداية
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editingOverlay.start}
                    onChange={(e) => setEditingOverlay({ ...editingOverlay, start: +e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "monospace",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    End (sec) / النهاية
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={editingOverlay.start + 0.2}
                    value={editingOverlay.end}
                    onChange={(e) => setEditingOverlay({ ...editingOverlay, end: +e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "monospace",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Category, Animation, Emoji */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    Category / التصنيف
                  </label>
                  <select
                    value={editingOverlay.category}
                    onChange={(e) => setEditingOverlay({ ...editingOverlay, category: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontSize: 12,
                    }}
                  >
                    {OVERLAY_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label.split("/")[0].trim()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    Animation / الحركة
                  </label>
                  <select
                    value={editingOverlay.animation}
                    onChange={(e) => setEditingOverlay({ ...editingOverlay, animation: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontSize: 12,
                    }}
                  >
                    {OVERLAY_ANIMATIONS.map((a) => (
                      <option key={a.id} value={a.id}>{a.label.split("/")[0].trim()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    Icon / الإيموجي
                  </label>
                  <select
                    value={editingOverlay.emoji || "💥"}
                    onChange={(e) => setEditingOverlay({ ...editingOverlay, emoji: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontSize: 12,
                    }}
                  >
                    {["💥", "🔥", "😱", "💰", "📈", "🚨", "⚠️", "💡", "⚡", "👑", "🎯", "👀", "🚀"].map((em) => (
                      <option key={em} value={em}>{em}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Vertical Position */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span>Screen Position / تمركز النص على الشاشة</span>
                  <span style={{ color: "var(--accent)" }}>{editingOverlay.position === "auto" ? "🤖 ذكي حسب الصورة (Auto)" : `${editingOverlay.position}%`}</span>
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {[
                    ["auto", "🤖 ذكي (حسب المشهد والصورة)"],
                    [70, "🔥 Top Hook (70%)"],
                    [55, "🎯 Shorts Center (55%)"],
                    [48, "🎬 Lower-Mid (48%)"],
                    [35, "📌 Bottom Safe (35%)"],
                  ].map(([v, lbl]) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setEditingOverlay({ ...editingOverlay, position: v })}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--line)",
                        background: editingOverlay.position === v ? "var(--elev-hover)" : "var(--panel-2)",
                        color: editingOverlay.position === v ? "var(--accent)" : "var(--text)",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                {editingOverlay.position !== "auto" && (
                  <input
                    type="range"
                    min="30"
                    max="80"
                    value={typeof editingOverlay.position === "number" ? editingOverlay.position : 55}
                    onChange={(e) => setEditingOverlay({ ...editingOverlay, position: +e.target.value })}
                    style={{ width: "100%" }}
                  />
                )}
              </div>

              {/* Color picker */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--panel-2)", borderRadius: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>
                  Custom Color / لون مخصص:
                </label>
                <input
                  type="color"
                  value={editingOverlay.color || "#FFE600"}
                  onChange={(e) => setEditingOverlay({ ...editingOverlay, color: e.target.value })}
                  style={{ width: 44, height: 32, borderRadius: 6, border: "none", cursor: "pointer" }}
                />
                <button
                  type="button"
                  onClick={() => onSeek && onSeek(editingOverlay.start)}
                  style={{
                    marginLeft: "auto",
                    padding: "6px 14px",
                    borderRadius: 7,
                    border: "1px solid var(--line)",
                    background: "var(--elev)",
                    color: "var(--text-pure)",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ▶ تجربة في المشغل
                </button>
              </div>
            </div>

            <div className="modal__actions" style={{ marginTop: 20 }}>
              <button className="mbtn" onClick={() => setEditingOverlay(null)}>إلغاء / Cancel</button>
              <button className="mbtn mbtn--primary" onClick={saveEditingOverlay}>حفظ التعديلات / Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SPACIOUS MODAL: ADD CUSTOM OVERLAY */}
      {/* ------------------------------------------------------------- */}
      {showAddForm && (
        <div className="modal-backdrop" onClick={() => setShowAddForm(false)}>
          <div className="modal" style={{ maxWidth: 620, width: "100%", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>+</span>
                <span className="modal__title">إضافة مؤثر نصي يدوي / Add Custom Overlay</span>
              </div>
              <button className="modal__close" onClick={() => setShowAddForm(false)} aria-label="Close">✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 6 }}>
                  نص المؤثر (مثال: WOW!, $1,000,000, 500%, DANGER, الحقيقة)
                </label>
                <input
                  type="text"
                  value={addForm.text}
                  onChange={(e) => setAddForm({ ...addForm, text: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--panel-2)",
                    color: "var(--text-pure)",
                    fontSize: 16,
                    fontWeight: 900,
                  }}
                  autoFocus
                />
              </div>

              {/* Style Selector */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 6 }}>
                  ستايل العرض / Trending Style
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
                  {OVERLAY_STYLES.map((st) => {
                    const isCur = addForm.style === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setAddForm({ ...addForm, style: st.id })}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: isCur ? "2px solid var(--accent)" : "1px solid var(--line)",
                          background: isCur ? "rgba(0, 245, 155, 0.15)" : "var(--panel-2)",
                          color: isCur ? "var(--accent)" : "var(--text)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 900 }}>{st.icon} {st.label.split("/")[0].trim()}</span>
                        <span style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{st.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    Start (sec) / البداية
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={addForm.start}
                    onChange={(e) => setAddForm({ ...addForm, start: +e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "monospace",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    End (sec) / النهاية
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={addForm.start + 0.2}
                    value={addForm.end}
                    onChange={(e) => setAddForm({ ...addForm, end: +e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontFamily: "monospace",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    التصنيف
                  </label>
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontSize: 12,
                    }}
                  >
                    {OVERLAY_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label.split("/")[0].trim()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    الحركة
                  </label>
                  <select
                    value={addForm.animation}
                    onChange={(e) => setAddForm({ ...addForm, animation: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontSize: 12,
                    }}
                  >
                    {OVERLAY_ANIMATIONS.map((a) => (
                      <option key={a.id} value={a.id}>{a.label.split("/")[0].trim()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    الإيموجي
                  </label>
                  <select
                    value={addForm.emoji || "💥"}
                    onChange={(e) => setAddForm({ ...addForm, emoji: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--panel-2)",
                      color: "var(--text)",
                      fontSize: 12,
                    }}
                  >
                    {["💥", "🔥", "😱", "💰", "📈", "🚨", "⚠️", "💡", "⚡", "👑", "🎯", "👀", "🚀"].map((em) => (
                      <option key={em} value={em}>{em}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="modal__actions" style={{ marginTop: 20 }}>
              <button className="mbtn" onClick={() => setShowAddForm(false)}>إلغاء / Cancel</button>
              <button className="mbtn mbtn--primary" onClick={saveNewOverlay}>+ إضافة إلى التايم لاين</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
