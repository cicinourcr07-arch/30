"use client";
import { useState, useEffect, useRef } from "react";
import { DEFAULT_CHANNELS, createDefaultGlobalSettings } from "../lib/narrativeModel";
import { EFFECT_LIST, applyEffect } from "../lib/effects";
import {
  TRANSITION_LIST,
  transitionOf,
  MIN_TRANSITION_DURATION,
  MAX_TRANSITION_DURATION,
} from "../lib/transitions";
import {
  CAPTION_STYLE_LIST,
  CAPTION_FONTS,
  CAPTION_PRESET_COLORS,
  CAPTION_ANIMATIONS,
  captionFontFamily,
  drawCaption,
} from "../lib/captions";
import { drawScene, sceneCanvas } from "./panels/sampleScene";
import EffectTile from "./panels/EffectTile";
import TransitionTile from "./panels/TransitionTile";
import CaptionStyleTile from "./panels/CaptionStyleTile";
import { showConfirm, showPrompt } from "./Dialog";
import Dropzone from "./Dropzone";
import { compressImageFile } from "../lib/imageUtils";
import {
  Tv,
  Plus,
  Trash2,
  Check,
  Image as ImageIcon,
  UserCheck,
  Film,
  ArrowLeft,
  Sliders,
  Type,
  Layers,
  Wand2,
  Play,
  Pause,
  FileText,
  Clapperboard,
  Shuffle,
  Sparkles,
  CheckCircle2,
  Monitor,
  Smartphone,
} from "lucide-react";

export default function ChannelsView({
  settings,
  globalSettings,
  onSaveSettings,
  onSaveGlobalSettings,
  onBack,
  uiLang = "en",
  onToggleLang,
  embedded = false,
}) {
  const isAr = uiLang === "ar";
  const resolvedSettings = globalSettings || settings;
  const resolvedSave = onSaveGlobalSettings || onSaveSettings;
  const [draft, setDraft] = useState(() => {
    const base = resolvedSettings || createDefaultGlobalSettings();
    return {
      ...base,
      channels:
        Array.isArray(base.channels) && base.channels.length
          ? base.channels
          : DEFAULT_CHANNELS,
      defaultChannelId: base.defaultChannelId || DEFAULT_CHANNELS[0].id,
    };
  });

  const [selectedChannelId, setSelectedChannelId] = useState(
    () => draft.defaultChannelId || draft.channels?.[0]?.id || "channel_default_1"
  );
  const [activeTab, setActiveTab] = useState("identity"); // "identity" | "references" | "editor"
  const [editorSubTab, setEditorSubTab] = useState("effects"); // "effects" | "transitions" | "motion" | "captions"
  const [filterCat, setFilterCat] = useState("all"); // "all" | "grade" | "fx"
  const [savedBanner, setSavedBanner] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(true);

  const activeChannel =
    draft.channels.find((c) => c.id === selectedChannelId) || draft.channels[0] || null;

  const defaultMixPool = ["fade", "wipeleft", "wiperight", "slideleft", "circleopen", "zoomin"];

  const defaultEditorCfg = {
    transitionType: "fade",
    transitionMixPool: defaultMixPool,
    transitionDuration: 0.4,
    motionMode: "alternate",
    motionAmount: 0.08,
    effectId: "cinema",
    effectIntensity: 0.5,
    fadeIn: 0.5,
    fadeOut: 0.6,
    captionsOn: true,
    captionStyle: "classic",
    captionFont: "montserrat",
    captionColor: "#FFFFFF",
    captionAnimation: "pop",
    captionSize: "md",
    captionPosition: 0,
  };

  const edCfg = {
    ...defaultEditorCfg,
    ...(activeChannel?.editorConfig || {}),
  };

  const mixPool =
    Array.isArray(edCfg.transitionMixPool) && edCfg.transitionMixPool.length
      ? edCfg.transitionMixPool
      : defaultMixPool;

  const persistDraft = (nextDraft) => {
    setDraft(nextDraft);
    if (typeof resolvedSave === "function") {
      resolvedSave(nextDraft);
    }
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 1800);
  };

  const updateActiveChannel = (patch) => {
    if (!activeChannel) return;
    const nextDraft = {
      ...draft,
      channels: draft.channels.map((c) =>
        c.id === activeChannel.id ? { ...c, ...patch } : c
      ),
    };
    persistDraft(nextDraft);
  };

  const updateEditorConfig = (patch) => {
    if (!activeChannel) return;
    updateActiveChannel({
      editorConfig: {
        ...edCfg,
        ...patch,
      },
    });
  };

  const toggleMixTransitionItem = (trId) => {
    const exists = mixPool.includes(trId);
    let nextPool = exists ? mixPool.filter((x) => x !== trId) : [...mixPool, trId];
    if (nextPool.length === 0) nextPool = [trId];
    updateEditorConfig({
      transitionType: "mix",
      transitionMixPool: nextPool,
    });
  };

  const handleAddChannel = async () => {
    const name = await showPrompt(
      isAr ? "أدخل اسم القناة الجديدة:" : "Enter new Channel Name:",
      {
        title: isAr ? "إضافة قناة جديدة" : "Add New Channel",
        defaultValue: isAr ? "قناتي الجديدة" : "My New Channel",
        okText: isAr ? "إنشاء القناة" : "Create Channel",
      }
    );
    if (!name || !name.trim()) return;
    const newCh = {
      id: `channel_${Date.now()}`,
      name: name.trim(),
      niche: "",
      aspectRatio: "16:9",
      voiceId: "onyx",
      promptRules:
        "SCRIPT RULES: Engaging narrative hook in the first 15 seconds, structured acts, conversational flow.\nSCENE & IMAGE RULES: Consistent visual art style, lighting, color palette, and character design across every standalone prompt.\nTHUMBNAIL RULES: High-contrast central subject, dramatic rim lighting, clear curiosity gap, 2-4 word bold text overlay.",
      additionalScriptRules:
        "Use active storytelling, strong curiosity transitions between paragraphs, and natural spoken rhythm.",
      additionalSceneRules:
        "Vary camera framing naturally between wide establishing shots, medium narrative shots, and expressive close-ups.",
      narrationStyle: "",
      scriptStyle: "",
      motionStyle: "",
      visualStyleRules: "",
      thumbnailStyleRules: "",
      avatarCharacterDesc: "",
      styleReferenceImages: [],
      thumbnailReferenceImages: [],
      avatarImages: [],
      editorConfig: { ...defaultEditorCfg },
    };
    const nextDraft = {
      ...draft,
      channels: [...draft.channels, newCh],
      defaultChannelId: newCh.id,
    };
    setSelectedChannelId(newCh.id);
    setActiveTab("identity");
    persistDraft(nextDraft);
  };

  const handleDeleteChannel = async (chId, e) => {
    if (e) e.stopPropagation();
    if (draft.channels.length <= 1) return;
    const target = draft.channels.find((c) => c.id === chId);
    const ok = await showConfirm(
      isAr
        ? `هل أنت متأكد من حذف قناة "${target?.name || ""}"؟`
        : `Delete channel "${target?.name || ""}"?`,
      { title: isAr ? "حذف القناة" : "Delete Channel", danger: true }
    );
    if (!ok) return;
    const remaining = draft.channels.filter((c) => c.id !== chId);
    const nextSel = remaining[0]?.id || "";
    const nextDraft = {
      ...draft,
      channels: remaining,
      defaultChannelId:
        draft.defaultChannelId === chId ? nextSel : draft.defaultChannelId,
    };
    setSelectedChannelId(nextSel);
    persistDraft(nextDraft);
  };

  const handleSetDefaultChannel = (chId, e) => {
    if (e) e.stopPropagation();
    const nextDraft = {
      ...draft,
      defaultChannelId: chId,
    };
    setSelectedChannelId(chId);
    persistDraft(nextDraft);
  };

  const handleUploadChannelImages = async (field, files) => {
    const fileArr = Array.from(files || []).slice(0, 6);
    if (!fileArr.length || !activeChannel) return;
    const uploaded = await Promise.all(
      fileArr.map(async (file) => {
        const compressedDataUrl = await compressImageFile(file, 640, 0.72);
        if (!compressedDataUrl) return null;
        return {
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          dataUrl: compressedDataUrl,
          mimeType: "image/jpeg",
        };
      })
    );
    const valid = uploaded.filter(Boolean);
    if (valid.length > 0) {
      const existing = Array.isArray(activeChannel[field]) ? activeChannel[field] : [];
      updateActiveChannel({
        [field]: [...existing, ...valid].slice(0, 8),
      });
    }
  };

  const handleRemoveChannelImage = (field, imgId) => {
    if (!activeChannel) return;
    const existing = Array.isArray(activeChannel[field]) ? activeChannel[field] : [];
    updateActiveChannel({
      [field]: existing.filter((img) => img.id !== imgId),
    });
  };

  // --- Real-Time Live Canvas Preview for Video Editor Presets ---
  const liveCanvasRef = useRef(null);
  const loadedPreviewImgRef = useRef(null);

  const previewImgUrl =
    activeChannel?.styleReferenceImages?.[0]?.dataUrl ||
    activeChannel?.avatarImages?.[0]?.dataUrl ||
    activeChannel?.thumbnailReferenceImages?.[0]?.dataUrl ||
    null;

  useEffect(() => {
    if (!previewImgUrl) {
      loadedPreviewImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      loadedPreviewImgRef.current = img;
    };
    img.src = previewImgUrl;
  }, [previewImgUrl]);

  useEffect(() => {
    if (activeTab !== "editor") return;
    let rafId = 0;
    const t0 = performance.now();

    const renderFrame = (now) => {
      const cv = liveCanvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      const W = cv.width;
      const H = cv.height;
      const elapsed = previewPlaying ? (now - t0) / 1000 : 1.5;

      // Cycle 3.6 seconds per simulated clip
      const cycleDur = 3.6;
      const cycleIndex = Math.floor(elapsed / cycleDur);
      const cyclePos = elapsed % cycleDur;
      const transDur = Math.max(0.15, Math.min(1.5, Number(edCfg.transitionDuration) || 0.4));

      // Resolve active transition (supports "mix" by cycling through the user's selected mix pool)
      const activeTrId =
        edCfg.transitionType === "mix"
          ? mixPool[cycleIndex % mixPool.length] || "fade"
          : edCfg.transitionType || "fade";

      const inTransition = activeTrId && activeTrId !== "cut" && cyclePos < transDur;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0a0a0c";
      ctx.fillRect(0, 0, W, H);

      const amt = Number(edCfg.motionAmount) || 0.08;
      const prog = cyclePos / cycleDur;
      let scale = 1;
      if (edCfg.motionMode === "zoomin") {
        scale = 1 + amt * prog;
      } else if (edCfg.motionMode === "zoomout") {
        scale = 1 + amt * (1 - prog);
      } else if (edCfg.motionMode === "alternate") {
        const isEven = cycleIndex % 2 === 0;
        scale = isEven ? 1 + amt * prog : 1 + amt * (1 - prog);
      }

      if (inTransition) {
        const p = Math.max(0, Math.min(1, cyclePos / transDur));
        const fromCv = sceneCanvas("dark", 240);
        const toCv = sceneCanvas("silver", 240);
        if (fromCv && toCv) {
          transitionOf(activeTrId).canvas(ctx, fromCv, toCv, p, W, H, 1, 1);
        }
      } else {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(scale, scale);
        ctx.translate(-W / 2, -H / 2);

        if (loadedPreviewImgRef.current) {
          const img = loadedPreviewImgRef.current;
          const imgRatio = img.width / img.height;
          const cvRatio = W / H;
          let dw = W,
            dh = H,
            dx = 0,
            dy = 0;
          if (imgRatio > cvRatio) {
            dh = H;
            dw = H * imgRatio;
            dx = (W - dw) / 2;
          } else {
            dw = W;
            dh = W / imgRatio;
            dy = (H - dh) / 2;
          }
          ctx.drawImage(img, dx, dy, dw, dh);
        } else {
          drawScene(ctx, W, H, "dark");
        }
        ctx.restore();
      }

      if (edCfg.effectId && edCfg.effectId !== "none") {
        applyEffect(
          ctx,
          edCfg.effectId,
          Number(edCfg.effectIntensity) ?? 0.5,
          W,
          H,
          elapsed
        );
      }

      if (edCfg.captionsOn !== false) {
        const sizeMap = { sm: 0.048, md: 0.064, lg: 0.082 };
        const fontPx = Math.round(H * (sizeMap[edCfg.captionSize || "md"] || 0.064));
        const posPctVal = Number(edCfg.captionPosition) || 0;
        const sampleText = isAr
          ? `معاينة ستايل الكتابة · ${activeChannel?.name || "القناة"}`
          : `LIVE CAPTION PREVIEW · ${(activeChannel?.name || "CHANNEL").toUpperCase()}`;

        drawCaption(
          ctx,
          sampleText,
          W,
          H,
          edCfg.captionStyle || "classic",
          fontPx,
          1.18,
          captionFontFamily(edCfg.captionFont || "montserrat"),
          posPctVal,
          {
            color: edCfg.captionColor || "#FFFFFF",
            animation: edCfg.captionAnimation || "pop",
            t: cyclePos % 1.8,
            start: 0,
            end: 1.8,
          }
        );
      }

      if (previewPlaying) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [
    activeTab,
    edCfg.effectId,
    edCfg.effectIntensity,
    edCfg.transitionType,
    edCfg.transitionDuration,
    edCfg.motionMode,
    edCfg.motionAmount,
    edCfg.captionsOn,
    edCfg.captionStyle,
    edCfg.captionFont,
    edCfg.captionColor,
    edCfg.captionAnimation,
    edCfg.captionSize,
    edCfg.captionPosition,
    mixPool,
    previewPlaying,
    activeChannel?.name,
    isAr,
  ]);

  const displayedEffects = EFFECT_LIST.filter((fx) => {
    if (filterCat === "all") return true;
    if (filterCat === "grade") return fx.group === "grade" || fx.id === "none";
    if (filterCat === "fx") return fx.group !== "grade" || fx.id === "none";
    return true;
  });

  const totalRefsCount =
    (activeChannel?.styleReferenceImages?.length || 0) +
    (activeChannel?.thumbnailReferenceImages?.length || 0) +
    (activeChannel?.avatarImages?.length || 0);

  return (
    <div
      className={embedded ? "uyns-settings" : "uyns-settings max-w-[1440px] mx-auto"}
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Top Studio Header — Theme-Aware (Light & Dark Mode) */}
      <div className="uyns-stage-card mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="uyns-btn uyns-btn--ghost uyns-btn--sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{isAr ? "رجوع" : "Back"}</span>
              </button>
            )}
            <div className="w-11 h-11 rounded-xl bg-[var(--panel-2)] border border-[var(--line)] flex items-center justify-center text-[var(--accent)] shrink-0 shadow-sm">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="uyns-stage-title">
                  {isAr ? "استوديو القنوات والهوية البصرية" : "Channels & Style Profiles"}
                </h1>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[var(--panel-2)] border border-[var(--line)] text-[var(--muted)]">
                  {draft.channels.length} {isAr ? "قنوات" : "Channels"}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                {isAr
                  ? "أنشئ بروفايل متكامل لكل قناة (طريقة السكريبت، برومبت الصور والمشاهد، المراجع البصرية، وإعدادات المونتاج التلقائية)"
                  : "Configure per-channel script rules, scene prompts, visual references, and automatic video editor presets."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {savedBanner && (
              <span className="px-3 py-1.5 rounded-lg bg-[var(--panel-2)] border border-[var(--line-glow)] text-xs font-bold text-[var(--accent)] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isAr ? "تم الحفظ تلقائياً" : "Saved"}</span>
              </span>
            )}
            {onToggleLang && (
              <button
                type="button"
                onClick={onToggleLang}
                className="uyns-btn uyns-btn--ghost uyns-btn--sm"
              >
                {isAr ? "English" : "العربية"}
              </button>
            )}
            <button
              type="button"
              onClick={handleAddChannel}
              className="uyns-btn uyns-btn--primary"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? "إضافة قناة جديدة" : "New Channel"}</span>
            </button>
          </div>
        </div>

        {/* Horizontal Channel Switcher Cards — Scannable, Clean & Light/Dark Aware */}
        <div className="mt-5 pt-5 border-t border-[var(--line-soft)]">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
              {isAr ? "اختر القناة لتعديل إعداداتها" : "Select Channel Profile"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {draft.channels.map((ch) => {
              const isSelected = ch.id === activeChannel?.id;
              const isDefault = ch.id === draft.defaultChannelId;
              const avatarThumb = ch.avatarImages?.[0]?.dataUrl;
              const styleThumb = ch.styleReferenceImages?.[0]?.dataUrl;

              return (
                <div
                  key={ch.id}
                  onClick={() => setSelectedChannelId(ch.id)}
                  className={`group relative rounded-xl p-3.5 cursor-pointer transition-all border flex items-center justify-between gap-3 ${
                    isSelected
                      ? "bg-[var(--panel-2)] border-[#3b82f6] shadow-sm ring-1 ring-[#3b82f6]/30"
                      : "bg-[var(--bg)] border-[var(--line)] hover:border-[var(--muted)]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-11 h-11 rounded-xl overflow-hidden border shrink-0 flex items-center justify-center ${
                        isSelected
                          ? "border-[#3b82f6] bg-[#3b82f6]/10 text-[#3b82f6]"
                          : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted)]"
                      }`}
                    >
                      {avatarThumb || styleThumb ? (
                        <img
                          src={avatarThumb || styleThumb}
                          alt={ch.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Tv className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-extrabold text-[var(--text-pure)] truncate">
                          {ch.name}
                        </span>
                        {isDefault && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 shrink-0">
                            {isAr ? "افتراضية" : "Default"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] mt-0.5 truncate">
                        <span className="truncate">
                          {ch.niche || (isAr ? "نيتش عام" : "General Niche")}
                        </span>
                        <span>·</span>
                        <span className="font-mono font-semibold">
                          {ch.aspectRatio || "16:9"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {draft.channels.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteChannel(ch.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--bad)] hover:bg-[var(--panel)] transition-all shrink-0"
                      title={isAr ? "حذف القناة" : "Delete channel"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add New Channel Card */}
            <button
              type="button"
              onClick={handleAddChannel}
              className="rounded-xl p-3.5 border border-dashed border-[var(--line)] hover:border-[#3b82f6] bg-[var(--bg)]/50 hover:bg-[var(--panel-2)] transition-all flex items-center justify-center gap-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--text-pure)] min-h-[68px]"
            >
              <Plus className="w-4 h-4 text-[#3b82f6]" />
              <span>{isAr ? "إضافة قناة جديدة" : "Create New Channel"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Channel Workspace Card */}
      {activeChannel && (
        <div className="uyns-stage-card space-y-6">
          {/* Active Channel Sub-Header & Segmented Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--line)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/15 border border-[#3b82f6]/40 flex items-center justify-center text-[#3b82f6] font-extrabold text-sm">
                {(activeChannel.name || "C").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-extrabold text-[var(--text-pure)]">
                    {activeChannel.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[var(--panel-2)] border border-[var(--line)] text-[var(--text)]">
                    {activeChannel.aspectRatio || "16:9"}
                  </span>
                  {draft.defaultChannelId === activeChannel.id ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                      {isAr ? "القناة الافتراضية ✓" : "Default Channel ✓"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleSetDefaultChannel(activeChannel.id, e)}
                      className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isAr ? "تعيين كافتراضية" : "Set as Default"}</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {activeChannel.niche ||
                    (isAr ? "حدد النيتش وأسلوب السكريبت والمشاهد بالأسفل" : "Configure niche, prompts, references, and editor presets below")}
                </p>
              </div>
            </div>

            {/* Theme-Aware Segmented Navigation */}
            <div className="uyns-segmented">
              <button
                type="button"
                onClick={() => setActiveTab("identity")}
                className={`uyns-segmented__btn ${activeTab === "identity" ? "is-active" : ""}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAr ? "1. الهوية والبرومبت" : "1. Prompts & Rules"}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("references")}
                className={`uyns-segmented__btn ${activeTab === "references" ? "is-active" : ""}`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>
                  {isAr
                    ? `2. الصور المرجعية (${totalRefsCount})`
                    : `2. Reference Images (${totalRefsCount})`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("editor")}
                className={`uyns-segmented__btn ${activeTab === "editor" ? "is-active" : ""}`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{isAr ? "3. إعدادات المحرر" : "3. Video Editor Presets"}</span>
              </button>
            </div>
          </div>

          {/* ==============================================================
              TAB 1: CHANNEL IDENTITY, MASTER PROMPT, ADDITIONAL SCRIPT & SCENE
              ============================================================== */}
          {activeTab === "identity" && (
            <div className="space-y-5">
              {/* Top Row: Name, Niche, Aspect Ratio */}
              <div className="uyns-card">
                <div className="uyns-card__head">
                  <h3 className="uyns-card__title">
                    {isAr ? "المعلومات الأساسية للقناة" : "Channel Identity & Format"}
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="uyns-field">
                    <label>{isAr ? "اسم القناة" : "Channel Name"}</label>
                    <input
                      type="text"
                      value={activeChannel.name || ""}
                      onChange={(e) => updateActiveChannel({ name: e.target.value })}
                      placeholder="e.g., Kurzgesagt Style Docs"
                    />
                  </div>

                  <div className="uyns-field">
                    <label>{isAr ? "النيتش (Niche)" : "Channel Niche"}</label>
                    <input
                      type="text"
                      value={activeChannel.niche || ""}
                      onChange={(e) => updateActiveChannel({ niche: e.target.value })}
                      placeholder="e.g., History, Science, Mystery..."
                    />
                  </div>

                  <div className="uyns-field">
                    <label>
                      {isAr ? "مقاس الفيديو (Aspect Ratio)" : "Video Aspect Ratio"}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateActiveChannel({ aspectRatio: "16:9" })}
                        className={`uyns-dur-pill flex items-center justify-center gap-1.5 ${
                          (activeChannel.aspectRatio || "16:9") === "16:9" ? "is-active" : ""
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>16:9 YouTube</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveChannel({ aspectRatio: "9:16" })}
                        className={`uyns-dur-pill flex items-center justify-center gap-1.5 ${
                          activeChannel.aspectRatio === "9:16" ? "is-active" : ""
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>9:16 Shorts</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Master Channel Prompt Box */}
              <div className="uyns-card">
                <div className="uyns-card__head">
                  <div>
                    <h3 className="uyns-card__title">
                      {isAr
                        ? "البرومبت الأساسي للقناة (طريقة السكريبت + ستايل توليد الصور + المشاهد)"
                        : "Master Channel Prompt (Script Style + Visual Generation + Scene Rules)"}
                    </h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {isAr
                        ? "يُطبّق تلقائياً عند اختيار هذه القناة في مرحلة الإعداد لتوجيه السكريبت والصور والمشاهد"
                        : "Automatically applied across Script, Scene Breakdown, and Image Prompts when this channel is selected."}
                    </p>
                  </div>
                </div>
                <div className="uyns-field">
                  <textarea
                    rows={4}
                    value={activeChannel.promptRules || ""}
                    onChange={(e) =>
                      updateActiveChannel({
                        promptRules: e.target.value,
                        visualStyleRules: e.target.value,
                      })
                    }
                    placeholder="Define your channel's core narrative voice, visual art style, lighting, color palette, and character rules..."
                  />
                </div>
              </div>

              {/* Additional Script & Additional Scene Side-by-Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="uyns-card">
                  <div className="uyns-card__head">
                    <h3 className="uyns-card__title flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#3b82f6]" />
                      <span>
                        {isAr
                          ? "تعليمات إضافية للسكريبت (Additional Script)"
                          : "Additional Script Instructions"}
                      </span>
                    </h3>
                  </div>
                  <div className="uyns-field">
                    <textarea
                      rows={4}
                      value={activeChannel.additionalScriptRules || ""}
                      onChange={(e) =>
                        updateActiveChannel({ additionalScriptRules: e.target.value })
                      }
                      placeholder={
                        isAr
                          ? "مثال: ابدأ دائماً بسؤال صادم، استخدم جمل قصيرة وسريعة، تجنب المقدمات الطويلة..."
                          : "e.g., Always open with a paradoxical question, keep sentences under 18 words, use dramatic pauses..."
                      }
                    />
                  </div>
                </div>

                <div className="uyns-card">
                  <div className="uyns-card__head">
                    <h3 className="uyns-card__title flex items-center gap-2">
                      <Clapperboard className="w-4 h-4 text-[var(--accent)]" />
                      <span>
                        {isAr
                          ? "تعليمات إضافية للمشاهد والصور (Additional Scene)"
                          : "Additional Scene & Image Prompt Instructions"}
                      </span>
                    </h3>
                  </div>
                  <div className="uyns-field">
                    <textarea
                      rows={4}
                      value={activeChannel.additionalSceneRules || ""}
                      onChange={(e) =>
                        updateActiveChannel({ additionalSceneRules: e.target.value })
                      }
                      placeholder={
                        isAr
                          ? "مثال: نوع بين اللقطات القريبة والبعيدة، ركز على تعابير الوجه والإضاءة الدرامية في كل مشهد..."
                          : "e.g., Alternate between extreme wide establishing shots and expressive close-ups, include volumetric fog..."
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Avatar & Thumbnail Rules */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="uyns-card">
                  <div className="uyns-card__head">
                    <h3 className="uyns-card__title">
                      {isAr
                        ? "وصف شخصية / أفاتار القناة الثابت (اختياري)"
                        : "Channel Avatar / Character Description (Optional)"}
                    </h3>
                  </div>
                  <div className="uyns-field">
                    <textarea
                      rows={2}
                      value={activeChannel.avatarCharacterDesc || ""}
                      onChange={(e) =>
                        updateActiveChannel({ avatarCharacterDesc: e.target.value })
                      }
                      placeholder="e.g., Faceless glowing silhouette wearing a dark trench coat and round glasses..."
                    />
                  </div>
                </div>

                <div className="uyns-card">
                  <div className="uyns-card__head">
                    <h3 className="uyns-card__title">
                      {isAr
                        ? "قواعد الصورة المصغرة (Thumbnail Style Rules)"
                        : "Thumbnail Style Rules (For Stage 10 SEO)"}
                    </h3>
                  </div>
                  <div className="uyns-field">
                    <textarea
                      rows={2}
                      value={activeChannel.thumbnailStyleRules || ""}
                      onChange={(e) =>
                        updateActiveChannel({ thumbnailStyleRules: e.target.value })
                      }
                      placeholder="e.g., High-contrast central subject, red/cyan rim lighting, 3-word bold yellow hook text..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 2: VISUAL STYLE, THUMBNAIL & AVATAR REFERENCE IMAGES
              ============================================================== */}
          {activeTab === "references" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 1. Image Style References */}
              <div className="uyns-card space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[var(--text-pure)] flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#3b82f6]" />
                    {isAr ? "مرجع ستايل الصور" : "Scene Style References"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[var(--bg)] border border-[var(--line)] text-[var(--muted)]">
                    {(activeChannel.styleReferenceImages || []).length}/8
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  {isAr
                    ? "ارفع صوراً تمثل ستايل الرسم والإضاءة والألوان المطلوب في مشاهد القناة."
                    : "Upload sample images representing the art style, lighting, and color grading for scenes."}
                </p>
                <Dropzone
                  compact
                  multiple
                  accept="image/*"
                  onFiles={(files) =>
                    handleUploadChannelImages("styleReferenceImages", files)
                  }
                  icon="+"
                  title={isAr ? "رفع صور الستايل" : "Upload Style Images"}
                  filled={false}
                />
                {(activeChannel.styleReferenceImages || []).length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {activeChannel.styleReferenceImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative group rounded-lg overflow-hidden border border-[var(--line)] aspect-video bg-[var(--bg)]"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveChannelImage("styleReferenceImages", img.id)
                          }
                          className="absolute top-1.5 right-1.5 bg-black/80 text-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Thumbnail Style References */}
              <div className="uyns-card space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[var(--text-pure)] flex items-center gap-1.5">
                    <Film className="w-4 h-4 text-[var(--accent)]" />
                    {isAr ? "مرجع الصورة المصغرة" : "Thumbnail References"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[var(--bg)] border border-[var(--line)] text-[var(--muted)]">
                    {(activeChannel.thumbnailReferenceImages || []).length}/8
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  {isAr
                    ? "ارفع أمثلة للصور المصغرة (Thumbnails) ليتم اقتراح 3 برومبتات مطابقة لها في بوابة السيو."
                    : "Upload sample YouTube thumbnails to guide the 3 thumbnail prompts in Stage 10."}
                </p>
                <Dropzone
                  compact
                  multiple
                  accept="image/*"
                  onFiles={(files) =>
                    handleUploadChannelImages("thumbnailReferenceImages", files)
                  }
                  icon="+"
                  title={isAr ? "رفع صور مصغرة" : "Upload Thumbnails"}
                  filled={false}
                />
                {(activeChannel.thumbnailReferenceImages || []).length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {activeChannel.thumbnailReferenceImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative group rounded-lg overflow-hidden border border-[var(--line)] aspect-video bg-[var(--bg)]"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveChannelImage("thumbnailReferenceImages", img.id)
                          }
                          className="absolute top-1.5 right-1.5 bg-black/80 text-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Avatar / Character References */}
              <div className="uyns-card space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[var(--text-pure)] flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-[#a855f7]" />
                    {isAr ? "صور أفاتار القناة" : "Channel Avatar Images"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[var(--bg)] border border-[var(--line)] text-[var(--muted)]">
                    {(activeChannel.avatarImages || []).length}/8
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  {isAr
                    ? "ارفع صور الشخصية الخاصة بالقناة للحفاظ على ثبات ملامحها وملابسها في كل المشاهد."
                    : "Upload character sheets or host avatars to keep character appearance locked."}
                </p>
                <Dropzone
                  compact
                  multiple
                  accept="image/*"
                  onFiles={(files) => handleUploadChannelImages("avatarImages", files)}
                  icon="+"
                  title={isAr ? "رفع صور الأفاتار" : "Upload Avatar"}
                  filled={false}
                />
                {(activeChannel.avatarImages || []).length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {activeChannel.avatarImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative group rounded-lg overflow-hidden border border-[var(--line)] aspect-square bg-[var(--bg)]"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveChannelImage("avatarImages", img.id)}
                          className="absolute top-1.5 right-1.5 bg-black/80 text-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 3: VIDEO EDITOR PRESETS WITH LIVE INTERACTIVE MONITOR
              ============================================================== */}
          {activeTab === "editor" && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* LEFT 7 COLS: Exact Editor Controls (Captions, Filters, Transitions + Mix, Motion) */}
              <div className="xl:col-span-7 space-y-5">
                {/* Sub-navigation using theme-aware uyns-segmented */}
                <div className="uyns-segmented w-full flex flex-wrap">
                  <button
                    type="button"
                    onClick={() => setEditorSubTab("captions")}
                    className={`uyns-segmented__btn flex-1 justify-center ${
                      editorSubTab === "captions" ? "is-active" : ""
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" />
                    <span>{isAr ? "الكابشن (Captions)" : "Captions"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorSubTab("effects")}
                    className={`uyns-segmented__btn flex-1 justify-center ${
                      editorSubTab === "effects" ? "is-active" : ""
                    }`}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>{isAr ? "الفلاتر (Filters)" : "Filters & FX"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorSubTab("transitions")}
                    className={`uyns-segmented__btn flex-1 justify-center ${
                      editorSubTab === "transitions" ? "is-active" : ""
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{isAr ? "الانتقالات (Transitions)" : "Transitions"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorSubTab("motion")}
                    className={`uyns-segmented__btn flex-1 justify-center ${
                      editorSubTab === "motion" ? "is-active" : ""
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>{isAr ? "الحركة (Motion)" : "Motion & Zoom"}</span>
                  </button>
                </div>

                {/* 1. CAPTIONS PANEL */}
                {editorSubTab === "captions" && (
                  <div className="space-y-4">
                    <div className="uyns-card flex items-center justify-between">
                      <div>
                        <div className="text-xs font-extrabold text-[var(--text-pure)]">
                          {isAr ? "تفعيل الكابشن تلقائياً" : "Enable Captions by Default"}
                        </div>
                        <div className="text-xs text-[var(--muted)] mt-0.5">
                          {isAr
                            ? "إظهار النصوص على الفيديو تلقائياً عند فتح المحرر"
                            : "Render styled subtitles over video clips automatically"}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={edCfg.captionsOn !== false}
                        onChange={(e) =>
                          updateEditorConfig({ captionsOn: e.target.checked })
                        }
                        className="w-4 h-4 accent-[#3b82f6]"
                      />
                    </div>

                    <div className="trgrid">
                      {CAPTION_STYLE_LIST.map((s) => (
                        <CaptionStyleTile
                          key={s.id}
                          st={s}
                          color={edCfg.captionColor || "#FFFFFF"}
                          fontFamily={captionFontFamily(edCfg.captionFont || "montserrat")}
                          on={(edCfg.captionStyle || "classic") === s.id}
                          onClick={() => updateEditorConfig({ captionStyle: s.id })}
                        />
                      ))}
                    </div>

                    <div className="uyns-card grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="uyns-field">
                        <label>{isAr ? "الخط (Font)" : "Font Family"}</label>
                        <select
                          value={edCfg.captionFont || "montserrat"}
                          onChange={(e) =>
                            updateEditorConfig({ captionFont: e.target.value })
                          }
                        >
                          {CAPTION_FONTS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="uyns-field">
                        <label>{isAr ? "حركة النص (Animation)" : "Text Animation"}</label>
                        <select
                          value={edCfg.captionAnimation || "pop"}
                          onChange={(e) =>
                            updateEditorConfig({ captionAnimation: e.target.value })
                          }
                        >
                          {CAPTION_ANIMATIONS.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="uyns-field">
                        <label>{isAr ? "حجم النص" : "Font Size"}</label>
                        <div className="flex gap-2">
                          {["sm", "md", "lg"].map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => updateEditorConfig({ captionSize: sz })}
                              className={`uyns-dur-pill flex-1 uppercase ${
                                (edCfg.captionSize || "md") === sz ? "is-active" : ""
                              }`}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="uyns-field sm:col-span-2">
                        <label>{isAr ? "لون النص (أو اختر أي لون مخصص)" : "Caption Color (Presets & Custom Picker)"}</label>
                        <div className="flex items-center gap-3 flex-wrap pt-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {CAPTION_PRESET_COLORS.map((c) => {
                              const hexVal = String(c.value || c.hex || "#FFFFFF");
                              const isSelected =
                                String(edCfg.captionColor || "#FFFFFF").toUpperCase() ===
                                hexVal.toUpperCase();
                              return (
                                <button
                                  key={c.id || hexVal}
                                  type="button"
                                  onClick={() => updateEditorConfig({ captionColor: hexVal })}
                                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                                    isSelected
                                      ? "border-[#3b82f6] scale-110 shadow-sm"
                                      : "border-[var(--line)] hover:scale-105"
                                  }`}
                                  style={{ backgroundColor: hexVal }}
                                  title={c.label}
                                />
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            <label
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] cursor-pointer hover:border-[#3b82f6] transition-colors"
                              title={isAr ? "اختر لوناً مخصصاً" : "Pick custom color"}
                            >
                              <input
                                type="color"
                                value={
                                  /^#[0-9A-Fa-f]{6}$/.test(edCfg.captionColor || "")
                                    ? edCfg.captionColor
                                    : "#FFFFFF"
                                }
                                onChange={(e) =>
                                  updateEditorConfig({ captionColor: e.target.value.toUpperCase() })
                                }
                                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                              />
                              <span className="text-xs font-semibold text-[var(--text-pure)]">
                                {isAr ? "لون مخصص" : "Custom Color"}
                              </span>
                            </label>

                            <input
                              type="text"
                              value={edCfg.captionColor || "#FFFFFF"}
                              onChange={(e) =>
                                updateEditorConfig({ captionColor: e.target.value })
                              }
                              placeholder="#FFFFFF"
                              className="!w-24 text-xs font-mono uppercase text-center"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. FILTERS & EFFECTS PANEL */}
                {editorSubTab === "effects" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="uyns-preset-tabs !mb-0">
                        {[
                          { id: "all", label: isAr ? "الكل" : "All" },
                          { id: "grade", label: isAr ? "فلاتر الألوان" : "Color Grades" },
                          { id: "fx", label: isAr ? "تأثيرات بصرية" : "Atmosphere FX" },
                        ].map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setFilterCat(t.id)}
                            className={`uyns-preset-tab ${
                              filterCat === t.id ? "is-active" : ""
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="trgrid">
                      {displayedEffects.map((fx) => (
                        <EffectTile
                          key={fx.id}
                          fx={fx}
                          on={fx.id === (edCfg.effectId || "none")}
                          onClick={() => updateEditorConfig({ effectId: fx.id })}
                        />
                      ))}
                    </div>

                    {edCfg.effectId && edCfg.effectId !== "none" && (
                      <div className="uyns-card space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--muted)]">
                            {isAr ? "قوة الفلتر / التأثير" : "Filter Intensity"}
                          </span>
                          <span className="font-mono font-bold text-[var(--text-pure)]">
                            {Math.round((Number(edCfg.effectIntensity) ?? 0.5) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={Number(edCfg.effectIntensity) ?? 0.5}
                          onChange={(e) =>
                            updateEditorConfig({ effectIntensity: +e.target.value })
                          }
                          className="w-full accent-[#3b82f6]"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 3. TRANSITIONS PANEL + MIX TRANSITIONS SELECTOR */}
                {editorSubTab === "transitions" && (
                  <div className="space-y-4">
                    {/* Mode Switch: Single Transition vs Mix Transitions */}
                    <div className="uyns-card space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-extrabold text-[var(--text-pure)] flex items-center gap-1.5">
                            <Shuffle className="w-4 h-4 text-[#3b82f6]" />
                            <span>
                              {isAr
                                ? "خلط الانتقالات عشوائياً (Mix Transitions)"
                                : "Mix Transitions (Random Distribution)"}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--muted)] mt-0.5">
                            {isAr
                              ? "اختر مجموعة انتقالات ليقوم المحرر بتوزيعها عشوائياً على جميع المشاهد"
                              : "Select multiple transitions below and distribute them randomly across all scenes"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updateEditorConfig({
                              transitionType:
                                edCfg.transitionType === "mix" ? "fade" : "mix",
                              transitionMixPool: mixPool,
                            })
                          }
                          className={`uyns-btn ${
                            edCfg.transitionType === "mix"
                              ? "uyns-btn--primary"
                              : "uyns-btn--ghost"
                          }`}
                        >
                          <Shuffle className="w-3.5 h-3.5" />
                          <span>
                            {edCfg.transitionType === "mix"
                              ? isAr
                                ? "وضع الخلط العشوائي مفعّل ✓"
                                : "Mix Mode Active ✓"
                              : isAr
                              ? "تفعيل Mix Transitions"
                              : "Enable Mix Transitions"}
                          </span>
                        </button>
                      </div>

                      {edCfg.transitionType === "mix" && (
                        <div className="pt-3 border-t border-[var(--line-soft)] space-y-2">
                          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                            <span>
                              {isAr
                                ? `انقر على البطاقات بالأسفل لاختيار أو إلغاء الانتقالات ضمن الخلط (${mixPool.length} مختارة):`
                                : `Click transition tiles below to toggle them in your random mix pool (${mixPool.length} selected):`}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateEditorConfig({
                                  transitionType: "mix",
                                  transitionMixPool: TRANSITION_LIST.filter(
                                    (t) => t.id !== "cut"
                                  ).map((t) => t.id),
                                })
                              }
                              className="text-[#3b82f6] font-bold hover:underline"
                            >
                              {isAr ? "تحديد الكل" : "Select All"}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {mixPool.map((id) => {
                              const tr = TRANSITION_LIST.find((x) => x.id === id);
                              if (!tr) return null;
                              return (
                                <span
                                  key={id}
                                  className="px-2.5 py-1 rounded-md bg-[var(--bg)] border border-[var(--line)] text-[var(--text-pure)] text-[11px] font-bold flex items-center gap-1"
                                >
                                  <span>{tr.icon}</span>
                                  <span>{tr.label}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Live Animated Transition Tiles Grid (16 Transitions) */}
                    <div className="trgrid">
                      {TRANSITION_LIST.map((t) => {
                        const isMix = edCfg.transitionType === "mix";
                        const isActive = isMix
                          ? mixPool.includes(t.id)
                          : edCfg.transitionType === t.id;
                        return (
                          <TransitionTile
                            key={t.id}
                            tr={t}
                            on={isActive}
                            onClick={() => {
                              if (isMix) {
                                if (t.id !== "cut") toggleMixTransitionItem(t.id);
                              } else {
                                updateEditorConfig({ transitionType: t.id });
                              }
                            }}
                          />
                        );
                      })}
                    </div>

                    <div className="uyns-card space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[var(--muted)]">
                          {isAr ? "مدة الانتقال (Transition Duration)" : "Transition Duration"}
                        </span>
                        <span className="font-mono font-bold text-[var(--text-pure)]">
                          {(Number(edCfg.transitionDuration) || 0.4).toFixed(2)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_TRANSITION_DURATION}
                        max={MAX_TRANSITION_DURATION}
                        step={0.05}
                        value={Number(edCfg.transitionDuration) || 0.4}
                        onChange={(e) =>
                          updateEditorConfig({ transitionDuration: +e.target.value })
                        }
                        className="w-full accent-[#3b82f6]"
                      />
                    </div>
                  </div>
                )}

                {/* 4. MOTION & ZOOM PANEL */}
                {editorSubTab === "motion" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { id: "alternate", label: isAr ? "متناوب (In/Out)" : "Alternate In/Out" },
                        { id: "zoomin", label: isAr ? "تقريب (Zoom In)" : "Zoom In All" },
                        { id: "zoomout", label: isAr ? "تبعيد (Zoom Out)" : "Zoom Out All" },
                        { id: "none", label: isAr ? "ثابت (Static)" : "Static (No Zoom)" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => updateEditorConfig({ motionMode: m.id })}
                          className={`uyns-dur-pill py-2.5 ${
                            (edCfg.motionMode || "alternate") === m.id ? "is-active" : ""
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="uyns-card space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold text-[var(--muted)]">
                            {isAr ? "مقدار الزوم (Zoom Depth)" : "Ken Burns Zoom Depth"}
                          </span>
                          <span className="font-mono font-bold text-[var(--text-pure)]">
                            {Math.round((Number(edCfg.motionAmount) || 0.08) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.02}
                          max={0.25}
                          step={0.01}
                          value={Number(edCfg.motionAmount) || 0.08}
                          onChange={(e) =>
                            updateEditorConfig({ motionAmount: +e.target.value })
                          }
                          className="w-full accent-[#3b82f6]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--line-soft)]">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-bold text-[var(--muted)]">Fade In</span>
                            <span className="font-mono font-bold text-[var(--text-pure)]">
                              {(Number(edCfg.fadeIn) || 0.5).toFixed(1)}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={0.1}
                            value={Number(edCfg.fadeIn) ?? 0.5}
                            onChange={(e) =>
                              updateEditorConfig({ fadeIn: +e.target.value })
                            }
                            className="w-full accent-[#3b82f6]"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-bold text-[var(--muted)]">Fade Out</span>
                            <span className="font-mono font-bold text-[var(--text-pure)]">
                              {(Number(edCfg.fadeOut) || 0.6).toFixed(1)}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={0.1}
                            value={Number(edCfg.fadeOut) ?? 0.6}
                            onChange={(e) =>
                              updateEditorConfig({ fadeOut: +e.target.value })
                            }
                            className="w-full accent-[#3b82f6]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT 5 COLS: Real-Time Interactive Live Monitor */}
              <div className="xl:col-span-5 sticky top-6">
                <div className="uyns-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-[var(--text-pure)] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                      {isAr ? "المعاينة الحية (Live Preview)" : "Live Preset Monitor"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewPlaying((p) => !p)}
                      className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                    >
                      {previewPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>{isAr ? "إيقاف مؤقت" : "Pause"}</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>{isAr ? "تشغيل" : "Play"}</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="relative rounded-xl overflow-hidden bg-black border border-[var(--line)] flex items-center justify-center shadow-inner">
                    <canvas
                      ref={liveCanvasRef}
                      width={activeChannel.aspectRatio === "9:16" ? 360 : 640}
                      height={activeChannel.aspectRatio === "9:16" ? 640 : 360}
                      className={
                        activeChannel.aspectRatio === "9:16"
                          ? "h-[340px] w-auto object-contain"
                          : "w-full aspect-video object-contain"
                      }
                    />
                  </div>

                  <div className="pt-2 border-t border-[var(--line-soft)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)] font-mono">
                    <span>FX: {edCfg.effectId || "none"}</span>
                    <span>·</span>
                    <span>
                      TR:{" "}
                      {edCfg.transitionType === "mix"
                        ? `Mix (${mixPool.length})`
                        : edCfg.transitionType || "fade"}
                    </span>
                    <span>·</span>
                    <span>Motion: {edCfg.motionMode || "alternate"}</span>
                    <span>·</span>
                    <span>Cap: {edCfg.captionStyle || "classic"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
