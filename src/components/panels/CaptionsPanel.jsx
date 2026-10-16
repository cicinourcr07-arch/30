import { useCallback, useRef } from "react";
import {
  CAPTION_STYLE_LIST, CAPTION_SIZES, captionLineHeightDefault,
  CAPTION_FONTS, captionFontFamily, captionPosPct as posPct,
  CAPTION_PRESET_COLORS, CAPTION_ANIMATIONS,
} from "../../lib/captions";
import CaptionStyleTile from "./CaptionStyleTile";

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
}) {
  const capInputRef = useRef(null);
  const onPickCaption = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file && onCaptionFile) onCaptionFile(file);
    e.target.value = "";
  }, [onCaptionFile]);

  return (
    <>
      <div className="panel captions">
        <h2 className="panel__h">Captions</h2>
        {!(captionCues && captionCues.length) ? (
          <div className="cap-empty" style={{ marginBottom: 14 }}>
            <button type="button" className="cap-upload" onClick={() => capInputRef.current && capInputRef.current.click()}>
              <span className="cap-upload__i">⤒</span> Upload timestamped script
            </button>
            <p className="cap-hint">
              An <code>.srt</code>, <code>.vtt</code>, or timestamped <code>.txt</code> — inline
              markers like <code>(0:03)</code>, NoteGPT ranges, or <code>[0:03]</code> lines all
              work. Captions sync to the audio and burn into the MP4.
            </p>
            {captionError && <div className="note note--bad">{captionError}</div>}
          </div>
        ) : (
          <div className="cap-bar">
            <button
              type="button"
              className={`cap-switch ${captionsOn ? "is-on" : ""}`}
              onClick={() => setCaptionsOn(!captionsOn)}
              aria-pressed={captionsOn}
            >
              <span className="cap-switch__box" />
              {captionsOn ? "On" : "Off"}
            </button>
            <span className="cap-meta">
              <span className="cap-meta__name">{captionName || "captions"}</span>
              {captionCues.length} lines ·{" "}
              <button type="button" className="cap-replace" onClick={() => capInputRef.current && capInputRef.current.click()}>replace</button>
            </span>
          </div>
        )}

        <div className="cap-body">
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

          <div className="mini-h" style={{ marginTop: 14 }}>Caption Color / لون الكتابة (اختر أي لون)</div>
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
              <label className="color-custom-btn" title="Choose custom color / اختيار لون مخصص">
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
              <div className="seg">
                {[[100, "Top"], [50, "Middle"], [0, "Bottom"]].map(([v, lbl]) => (
                  <button
                    key={lbl}
                    type="button"
                    className={Math.round(posPct(captionPosition)) === v ? "is-on" : ""}
                    onClick={() => setCaptionPosition(v)}
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
            {captionError && <div className="note note--bad">{captionError}</div>}
      </div>
      <input
        ref={capInputRef} type="file" accept=".srt,.vtt,.txt,text/plain" hidden
        onChange={onPickCaption}
      />
    </>
  );
}
