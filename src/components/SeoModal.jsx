"use client";
import { useState } from "react";
import { generateSeoPackage } from "../lib/aiService";
import { formatDurationClock } from "../lib/narrativeModel";
import {
  X,
  Sparkles,
  Copy,
  Check,
  Download,
  FileText,
  Hash,
  ListOrdered,
  Image as ImageIcon,
  Settings2,
} from "lucide-react";

export default function SeoModal({
  open,
  onClose,
  projectName,
  onSelectFinalTitle,
  narrative,
  globalSettings,
  onUpdateSeo,
  uiLang = "en",
}) {
  if (!open) return null;
  const isAr = uiLang === "ar";
  const seo = narrative?.seoPackage || {
    titles: [],
    description: "",
    chapters: [],
    tags: [],
    hashtags: [],
    thumbnails: [],
    metadata: {
      category: narrative?.selectedConcept?.niche || narrative?.analysis?.niche || "Education",
      language: narrative?.config?.language || "English (US)",
      madeForKids: false,
      license: "Standard YouTube License",
    },
  };

  const [tab, setTab] = useState("titles");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch (_) {}
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const channels = globalSettings?.channels || [];
      const activeChannel =
        channels.find((c) => c.id === (narrative?.channelId || globalSettings?.defaultChannelId)) ||
        channels[0] ||
        null;
      const res = await generateSeoPackage({
        projectName,
        concept: narrative?.selectedConcept,
        niche: activeChannel?.niche || narrative?.selectedConcept?.niche || narrative?.analysis?.niche,
        script: narrative?.approvedScript || narrative?.scriptDraft,
        scenes: narrative?.scenes || [],
        actualDurationSec:
          narrative?.actualDurationSec ||
          (narrative?.config?.targetDurationMinutes || 10) * 60,
        language: narrative?.config?.language || "English (US)",
        channelProfile: activeChannel,
        provider:
          globalSettings?.aiSettings?.activeProvider ||
          (globalSettings?.aiSettings?.externalApi?.enabled ? "external" : "gemini"),
        codecraftConfig:
          globalSettings?.aiSettings?.externalApi ||
          globalSettings?.aiSettings?.codecraft ||
          null,
      });
      onUpdateSeo(res);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setGenerating(false);
    }
  };

  const tagsCsv = (seo.tags || []).join(", ");
  const tagsCharCount = tagsCsv.length;

  const formatMarkdownExport = () => {
    const lines = [
      `# YouTube SEO Package — ${projectName || "Untitled Project"}`,
      "",
      `## Title Options (${(seo.titles || []).length})`,
      ...(seo.titles || []).map((t, i) => `${i + 1}. ${t}`),
      "",
      `## Description`,
      seo.description || "",
      "",
      `## Video Chapters (Duration: ${formatDurationClock(narrative?.actualDurationSec || 0)})`,
      ...(seo.chapters || []).map(
        (c) => `${c.timestamp} ${c.title}${c.isEstimate ? " (Estimate)" : ""}`
      ),
      "",
      `## Tags (${tagsCharCount} / 500 chars)`,
      tagsCsv,
      "",
      `## Hashtags`,
      (seo.hashtags || []).join(" "),
      "",
      `## Thumbnail Concepts`,
      ...(seo.thumbnails || []).map(
        (th, i) =>
          `### Option ${i + 1}: ${th.conceptTitle}\n- **Overlay Text:** ${th.suggestedText}\n- **Visual Prompt:** ${th.visualPrompt}\n- **Notes:** ${th.compositionNotes}`
      ),
      "",
      `## Publishing Metadata`,
      `- Category: ${seo.metadata?.category || "Education"}`,
      `- Language: ${seo.metadata?.language || "English (US)"}`,
      `- License: ${seo.metadata?.license || "Standard YouTube License"}`,
    ];
    return lines.join("\n");
  };

  const downloadExport = (ext = "md") => {
    const content = formatMarkdownExport();
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (projectName || "youtube_seo").replace(/[^\w.-]+/g, "_");
    a.href = url;
    a.download = `${safeName}_SEO_Package.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="uyns-modal-backdrop" onClick={onClose} dir={isAr ? "rtl" : "ltr"}>
      <div className="uyns-seo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="uyns-seo-modal__header">
          <div>
            <h2 className="uyns-seo-modal__title">
              {isAr ? "حزمة سيو يوتيوب (YouTube SEO Package)" : "YouTube SEO Package"}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              {projectName || "Untitled Project"} ·{" "}
              {narrative?.selectedConcept?.niche || narrative?.analysis?.niche || "Documentary"} ·{" "}
              {formatDurationClock(narrative?.actualDurationSec || 0)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="uyns-btn uyns-btn--primary uyns-btn--sm"
              disabled={generating}
              onClick={handleGenerate}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {generating
                  ? isAr
                    ? "جاري التوليد..."
                    : "Generating SEO..."
                  : seo.titles?.length
                  ? isAr
                    ? "إعادة توليد بالذكاء الاصطناعي"
                    : "Regenerate SEO"
                  : isAr
                  ? "توليد حزمة السيو"
                  : "Generate SEO with AI"}
              </span>
            </button>
            <button
              type="button"
              className="uyns-btn uyns-btn--ghost uyns-btn--sm"
              onClick={() => copyText(formatMarkdownExport(), "all")}
            >
              {copiedKey === "all" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === "all" ? (isAr ? "تم النسخ" : "Copied All") : isAr ? "نسخ الكل" : "Copy All"}</span>
            </button>
            <button
              type="button"
              className="uyns-btn uyns-btn--ghost uyns-btn--sm"
              onClick={() => downloadExport("md")}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? "تصدير" : "Export"}</span>
            </button>
            <button type="button" className="uyns-icon-btn" onClick={onClose} aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && <div className="uyns-alert uyns-alert--bad mx-5 mt-3">{error}</div>}

        <div className="uyns-seo-tabs">
          {[
            { id: "titles", label: isAr ? "العناوين (5)" : "Titles", icon: FileText },
            { id: "description", label: isAr ? "الوصف" : "Description", icon: FileText },
            { id: "chapters", label: isAr ? "الفصول الزمنية" : "Chapters", icon: ListOrdered },
            { id: "tags", label: isAr ? "الكلمات المفتاحية" : "Tags", icon: Hash },
            { id: "thumbnail", label: isAr ? "الصورة المصغرة" : "Thumbnail", icon: ImageIcon },
            { id: "metadata", label: isAr ? "بيانات النشر" : "Metadata", icon: Settings2 },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`uyns-seo-tab ${tab === t.id ? "is-active" : ""}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="uyns-seo-modal__body">
          {!seo.titles?.length && !generating && (
            <div className="uyns-empty-box mb-4">
              <p>
                {isAr
                  ? "اضغط على 'توليد حزمة السيو' لإنشاء 5 عناوين مقترحة، وصف كامل، فصول زمنية متطابقة مع المشاهد، كلمات دلالية، وأفكار للصورة المصغرة."
                  : "Click 'Generate SEO with AI' above to create 5 title options, a full YouTube description, scene-synced timestamps, tags (<500 chars), and thumbnail concepts from your project data."}
              </p>
            </div>
          )}

          {tab === "titles" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {isAr ? "خيارات العناوين المقترحة (5) — اختر العنوان النهائي" : "Title Options (5) — Select Final Project Title"}
                    </h3>
                    <p className="text-[11px] text-[var(--muted)]">
                      {isAr
                        ? "اختيار العنوان النهائي يغير اسم المشروع تلقائياً."
                        : "Selecting a final title updates the project name automatically."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="uyns-btn uyns-btn--sm"
                    onClick={() => copyText((seo.titles || []).join("\n"), "titles")}
                  >
                    {copiedKey === "titles" ? "Copied ✓" : "Copy All"}
                  </button>
                </div>
                {[0, 1, 2, 3, 4].map((idx) => {
                  const val = seo.titles?.[idx] || "";
                  const isSelectedTitle =
                    (seo.selectedTitle || projectName || "") === val && Boolean(val.trim());
                  const handlePickFinal = () => {
                    if (!val.trim()) return;
                    const clean = val.trim();
                    onUpdateSeo({ ...seo, selectedTitle: clean });
                    if (onSelectFinalTitle) onSelectFinalTitle(clean);
                  };
                  return (
                    <div
                      key={idx}
                      className={`uyns-seo-title-row transition-all ${
                        isSelectedTitle
                          ? "!border-[var(--accent)] !bg-[rgba(0,245,155,0.08)]"
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={handlePickFinal}
                        className={`uyns-seo-title-num cursor-pointer transition-colors ${
                          isSelectedTitle
                            ? "!bg-[var(--accent)] !text-[var(--accent-ink)]"
                            : ""
                        }`}
                      >
                        {isSelectedTitle ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                      </button>
                      <input
                        type="text"
                        value={val}
                        placeholder={`Title option ${idx + 1}...`}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          const next = [...(seo.titles || ["", "", "", "", ""])];
                          next[idx] = nextVal;
                          const wasSelected = seo.selectedTitle === val;
                          onUpdateSeo({
                            ...seo,
                            titles: next,
                            ...(wasSelected ? { selectedTitle: nextVal } : {}),
                          });
                          if (isSelectedTitle && onSelectFinalTitle && nextVal.trim()) {
                            onSelectFinalTitle(nextVal.trim());
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handlePickFinal}
                        className={`uyns-btn uyns-btn--sm ${
                          isSelectedTitle ? "uyns-btn--primary" : "uyns-btn--ghost"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {isSelectedTitle
                            ? isAr
                              ? "العنوان النهائي ✓"
                              : "Final Title ✓"
                            : isAr
                            ? "اختيار كعنوان نهائي"
                            : "Select as Final"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="uyns-btn uyns-btn--sm uyns-btn--ghost"
                        onClick={() => copyText(val, `t_${idx}`)}
                      >
                        {copiedKey === `t_${idx}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="uyns-card">
                <h3 className="text-sm font-semibold mb-2">
                  {isAr ? "معاينة الصورة المصغرة والنص" : "Thumbnail & Hook Preview"}
                </h3>
                {narrative?.reference?.thumbnailUrl ? (
                  <img
                    src={narrative.reference.thumbnailUrl}
                    alt="Thumbnail reference"
                    referrerPolicy="no-referrer"
                    className="w-full h-36 object-cover rounded-lg mb-3 border border-[var(--line)]"
                  />
                ) : (
                  <div className="w-full h-36 rounded-lg mb-3 bg-[var(--elev)] flex items-center justify-center text-xs text-[var(--muted)]">
                    16:9 Thumbnail Preview
                  </div>
                )}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    {isAr ? "النصوص المقترحة على الصورة:" : "Suggested Thumbnail Text:"}
                  </span>
                  {(seo.thumbnails || []).map((th, i) => (
                    <div
                      key={i}
                      className="text-xs px-2.5 py-1.5 rounded bg-[var(--panel-2)] border border-[var(--line-soft)] flex items-center justify-between"
                    >
                      <span className="font-bold tracking-wide">{th.suggestedText}</span>
                      <button
                        type="button"
                        className="text-[var(--accent)] hover:underline"
                        onClick={() => copyText(th.suggestedText, `th_txt_${i}`)}
                      >
                        {copiedKey === `th_txt_${i}` ? "✓" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "description" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {isAr ? "وصف الفيديو الكامل" : "Complete YouTube Description"}
                </h3>
                <button
                  type="button"
                  className="uyns-btn uyns-btn--sm"
                  onClick={() => copyText(seo.description, "desc")}
                >
                  {copiedKey === "desc" ? "Copied ✓" : "Copy Description"}
                </button>
              </div>
              <textarea
                rows={12}
                className="w-full rounded-xl bg-[var(--panel-2)] border border-[var(--line)] p-3.5 text-sm leading-relaxed"
                value={seo.description || ""}
                placeholder="Video summary, key takeaways, timestamps, and call to action..."
                onChange={(e) => onUpdateSeo({ ...seo, description: e.target.value })}
              />
            </div>
          )}

          {tab === "chapters" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">
                    {isAr ? "فصول الفيديو الزمنية (Chapters)" : "Estimated Video Chapters"}
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    {isAr
                      ? "مرتبة زمنياً ومتوافقة مع مدة الصوت الفعلية."
                      : `Ordered timestamps within actual video duration (${formatDurationClock(
                          narrative?.actualDurationSec || 0
                        )}).`}
                  </p>
                </div>
                <button
                  type="button"
                  className="uyns-btn uyns-btn--sm"
                  onClick={() =>
                    copyText(
                      (seo.chapters || []).map((c) => `${c.timestamp} ${c.title}`).join("\n"),
                      "chapters"
                    )
                  }
                >
                  {copiedKey === "chapters" ? "Copied ✓" : "Copy Chapters"}
                </button>
              </div>
              <div className="space-y-2">
                {(seo.chapters || []).map((ch, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      className="w-24 font-mono text-xs px-2.5 py-2 rounded-lg bg-[var(--panel-2)] border border-[var(--line)]"
                      value={ch.timestamp}
                      onChange={(e) => {
                        const next = [...seo.chapters];
                        next[idx] = { ...ch, timestamp: e.target.value };
                        onUpdateSeo({ ...seo, chapters: next });
                      }}
                    />
                    <input
                      type="text"
                      className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--panel-2)] border border-[var(--line)]"
                      value={ch.title}
                      onChange={(e) => {
                        const next = [...seo.chapters];
                        next[idx] = { ...ch, title: e.target.value };
                        onUpdateSeo({ ...seo, chapters: next });
                      }}
                    />
                    <span className="text-xs text-[var(--muted)]">
                      {ch.isEstimate ? (isAr ? "تقديري" : "Estimate") : "Verified"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "tags" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">
                    {isAr ? "الكلمات المفتاحية (YouTube Tags)" : "YouTube Tags (Comma-Separated)"}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-mono ${
                        tagsCharCount > 500 ? "text-[var(--bad)] font-bold" : "text-[var(--muted)]"
                      }`}
                    >
                      {tagsCharCount} / 500 characters
                    </span>
                    <button
                      type="button"
                      className="uyns-btn uyns-btn--sm"
                      onClick={() => copyText(tagsCsv, "tags")}
                    >
                      {copiedKey === "tags" ? "Copied ✓" : "Copy Tags"}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  className="w-full rounded-xl bg-[var(--panel-2)] border border-[var(--line)] p-3 text-sm"
                  value={tagsCsv}
                  onChange={(e) => {
                    const arr = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    onUpdateSeo({ ...seo, tags: arr });
                  }}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">
                    {isAr ? "الهاشتاجات (Hashtags)" : "Relevant Hashtags"}
                  </h3>
                  <button
                    type="button"
                    className="uyns-btn uyns-btn--sm"
                    onClick={() => copyText((seo.hashtags || []).join(" "), "hashtags")}
                  >
                    {copiedKey === "hashtags" ? "Copied ✓" : "Copy Hashtags"}
                  </button>
                </div>
                <input
                  type="text"
                  className="w-full rounded-xl bg-[var(--panel-2)] border border-[var(--line)] p-3 text-sm"
                  value={(seo.hashtags || []).join(" ")}
                  onChange={(e) =>
                    onUpdateSeo({
                      ...seo,
                      hashtags: e.target.value.split(/\s+/).filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          )}

          {tab === "thumbnail" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(seo.thumbnails || []).map((th, idx) => (
                <div key={idx} className="uyns-card space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--accent)]">
                      Concept {idx + 1}: {th.conceptTitle}
                    </span>
                    <button
                      type="button"
                      className="uyns-btn uyns-btn--sm"
                      onClick={() => copyText(th.visualPrompt, `thp_${idx}`)}
                    >
                      {copiedKey === `thp_${idx}` ? "Copied ✓" : "Copy Prompt"}
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">Suggested Text Overlay</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-2.5 py-1.5 rounded bg-[var(--panel-2)] border border-[var(--line)] text-xs font-bold"
                      value={th.suggestedText || ""}
                      onChange={(e) => {
                        const next = [...seo.thumbnails];
                        next[idx] = { ...th, suggestedText: e.target.value };
                        onUpdateSeo({ ...seo, thumbnails: next });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)]">Thumbnail Image Prompt</label>
                    <textarea
                      rows={4}
                      className="w-full mt-1 px-2.5 py-1.5 rounded bg-[var(--panel-2)] border border-[var(--line)] text-xs"
                      value={th.visualPrompt || ""}
                      onChange={(e) => {
                        const next = [...seo.thumbnails];
                        next[idx] = { ...th, visualPrompt: e.target.value };
                        onUpdateSeo({ ...seo, thumbnails: next });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "metadata" && (
            <div className="uyns-form-grid max-w-xl">
              <div className="uyns-field">
                <label>{isAr ? "تصنيف يوتيوب المقترح" : "Suggested YouTube Category"}</label>
                <input
                  type="text"
                  value={seo.metadata?.category || ""}
                  onChange={(e) =>
                    onUpdateSeo({
                      ...seo,
                      metadata: { ...seo.metadata, category: e.target.value },
                    })
                  }
                />
              </div>
              <div className="uyns-field">
                <label>{isAr ? "لغة الفيديو" : "Video Language"}</label>
                <input
                  type="text"
                  value={seo.metadata?.language || ""}
                  onChange={(e) =>
                    onUpdateSeo({
                      ...seo,
                      metadata: { ...seo.metadata, language: e.target.value },
                    })
                  }
                />
              </div>
              <div className="uyns-field">
                <label>{isAr ? "الترخيص" : "License"}</label>
                <input
                  type="text"
                  value={seo.metadata?.license || "Standard YouTube License"}
                  onChange={(e) =>
                    onUpdateSeo({
                      ...seo,
                      metadata: { ...seo.metadata, license: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="uyns-seo-modal__footer">
          <button type="button" className="uyns-btn uyns-btn--ghost" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="uyns-btn uyns-btn--ghost"
              onClick={() => downloadExport("txt")}
            >
              {isAr ? "تصدير TXT" : "Export TXT"}
            </button>
            <button
              type="button"
              className="uyns-btn uyns-btn--primary"
              onClick={() => downloadExport("md")}
            >
              {isAr ? "تصدير حزمة Markdown" : "Export Markdown Package"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
