import { useState, useEffect, useCallback, useRef } from "react";
import {
  BUILTIN_TEMPLATES,
  getSavedTemplates,
  saveUserTemplate,
  deleteUserTemplate,
  exportTemplatesJson,
  importTemplatesJson,
} from "../../lib/templates";

export default function TemplatesPanel({
  onApplyTemplate,
  currentSettings,
}) {
  const [userTemplates, setUserTemplates] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const importInputRef = useRef(null);

  useEffect(() => {
    setUserTemplates(getSavedTemplates());
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = templateName.trim();
    if (!trimmed) return;
    const toSave = {
      name: trimmed,
      captionStyle: currentSettings.captionStyle,
      captionColor: currentSettings.captionColor,
      captionAnimation: currentSettings.captionAnimation,
      captionFont: currentSettings.captionFont,
      captionSize: currentSettings.captionSize,
      captionPosition: currentSettings.captionPosition,
      captionLineHeight: currentSettings.captionLineHeight,
      captionFontScale: currentSettings.captionFontScale,
      effectId: currentSettings.effectId,
      effectIntensity: currentSettings.effectIntensity,
    };
    const updated = saveUserTemplate(toSave);
    setUserTemplates(updated);
    setTemplateName("");
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  }, [templateName, currentSettings]);

  const handleDelete = useCallback((id) => {
    const updated = deleteUserTemplate(id);
    setUserTemplates(updated);
  }, []);

  const handleImport = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const res = importTemplatesJson(evt.target.result);
      if (res) {
        setUserTemplates(res);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  return (
    <div className="panel templates-panel">
      <h2 className="panel__h">Style Templates / القوالب المحفوظة</h2>
      <div className="mini-h">
        Apply ready-made aesthetics or save your current styling for any project.
      </div>

      {/* Save Current Style Box */}
      <div className="save-template-box">
        <div className="mini-h" style={{ marginBottom: 6, color: "var(--text)", fontWeight: 600 }}>
          Save Current Style / حفظ الستايل الحالي
        </div>
        <div className="save-template-row">
          <input
            type="text"
            className="save-template-input"
            placeholder="Template name (e.g. My Shorts Style)..."
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button
            type="button"
            className="save-template-btn"
            disabled={!templateName.trim()}
            onClick={handleSave}
          >
            Save (حفظ)
          </button>
        </div>
        {savedSuccess && (
          <div className="template-success-msg">✓ Template saved successfully! / تم حفظ القالب</div>
        )}
        <div className="template-io-row" style={{ marginTop: 10, display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="template-io-btn"
            onClick={exportTemplatesJson}
            title="Export all saved templates as a JSON file"
          >
            📥 Export Backup (تصدير القوالب)
          </button>
          <button
            type="button"
            className="template-io-btn"
            onClick={() => importInputRef.current && importInputRef.current.click()}
            title="Import templates from a JSON file"
          >
            📤 Import (استيراد)
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleImport}
          />
        </div>
      </div>

      {/* User Saved Templates */}
      {userTemplates.length > 0 && (
        <div className="templates-section">
          <div className="mini-h" style={{ marginTop: 14 }}>Your Custom Templates / قوالبك الخاصة</div>
          <div className="templates-list">
            {userTemplates.map((t) => (
              <div key={t.id} className="template-card">
                <div className="template-card__header">
                  <div className="template-card__title">
                    <span
                      className="template-card__dot"
                      style={{ backgroundColor: t.captionColor || "#FFFFFF" }}
                    />
                    <span>{t.name}</span>
                  </div>
                  <button
                    type="button"
                    className="template-card__del"
                    title="Delete template"
                    onClick={() => handleDelete(t.id)}
                  >
                    ✕
                  </button>
                </div>
                <div className="template-card__meta">
                  <span>Anim: {t.captionAnimation || "pop"}</span> ·{" "}
                  <span>Font: {t.captionFont || "default"}</span>
                </div>
                <button
                  type="button"
                  className="template-card__apply"
                  onClick={() => onApplyTemplate && onApplyTemplate(t)}
                >
                  Apply Template / تطبيق القالب
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in Presets */}
      <div className="templates-section" style={{ marginTop: 16 }}>
        <div className="mini-h">Built-in Presets / قوالب جاهزة</div>
        <div className="templates-list">
          {BUILTIN_TEMPLATES.map((t) => (
            <div key={t.id} className="template-card">
              <div className="template-card__header">
                <div className="template-card__title">
                  <span
                    className="template-card__dot"
                    style={{ backgroundColor: t.captionColor || "#FFFFFF" }}
                  />
                  <span>{t.name}</span>
                </div>
              </div>
              <p className="template-card__desc">{t.desc}</p>
              <button
                type="button"
                className="template-card__apply"
                onClick={() => onApplyTemplate && onApplyTemplate(t)}
              >
                Apply Preset / استخدام
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
