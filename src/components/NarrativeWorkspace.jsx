"use client";
import { useState, useMemo } from "react";
import {
  WORKFLOW_STAGES,
  SUPPORTED_VOICES,
  parseDurationInput,
  formatDurationClock,
  formatFilenameTimestamp,
  recalculateSceneTimings,
} from "../lib/narrativeModel";
import {
  fetchYouTubeMetadata,
  analyzeReferenceAndConcepts,
  regenerateConcepts,
  generateOrEditScript,
  generateVoiceoverTTS,
  generateSceneImage,
  generateSceneBreakdown,
  generateImagePromptsBatch,
  generateMotionPromptsBatch,
  generateSeoPackage,
} from "../lib/aiService";
import { compressImageFile } from "../lib/imageUtils";
import { showAlert, showConfirm, showPrompt } from "./Dialog";
import Dropzone from "./Dropzone";
import ChannelsView from "./ChannelsView";
import {
  Play,
  Home,
  FolderPlus,
  Folders,
  Settings,
  Sparkles,
  Check,
  AlertTriangle,
  Copy,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Upload,
  Film,
  Volume2,
  FileText,
  Scissors,
  Merge,
  ArrowUp,
  ArrowDown,
  Download,
  ExternalLink,
  Sun,
  Moon,
  Globe,
  CheckCircle2,
  Edit3,
  Zap,
  Tv,
  RotateCcw,
  RotateCw,
} from "lucide-react";

export default function NarrativeWorkspace({
  currentProject,
  onRenameProject,
  narrative,
  updateNarrative,
  globalSettings,
  onSaveGlobalSettings,
  applyChannelEditorPresets,
  backToProjects,
  openSettingsFromWorkspace,
  openChannelsFromWorkspace,
  // Media & Editor integration props from App.jsx
  audioFile,
  audioUrl,
  audioDuration,
  onAudio,
  slots,
  addImages,
  replaceImage,
  removeImage,
  syncScenesToEditorSlots,
  captionRaw,
  captionName,
  captionCues,
  captionError,
  onCaptionFile,
  onUpdateCaptionRaw,
  onOpenVideoEditor,
  onOpenSeoModal,
  loadSampleDemo,
  loadingSample,
  theme,
  setTheme,
  uiLang = "en",
  setUiLang,
  undo,
  redo,
  canUndo,
  canRedo,
  onQuickExport,
  editorNode,
}) {
  const isAr = uiLang === "ar";
  const stage = narrative.currentStage || 1;
  const maxUnlocked = narrative.maxUnlockedStage || 1;

  const [busyMsg, setBusyMsg] = useState(null);
  const [stageError, setStageError] = useState(null);
  const [conceptTab, setConceptTab] = useState("concepts"); // "analysis" | "concepts" | "styleLock"
  const [promptTab, setPromptTab] = useState("image"); // "image" | "motion"
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const [showInlineChannels, setShowInlineChannels] = useState(false);

  const activeAiProvider =
    globalSettings?.aiSettings?.activeProvider ||
    (globalSettings?.aiSettings?.externalApi?.enabled ? "external" : "gemini");
  const textProvider = activeAiProvider;
  const imageProvider =
    activeAiProvider === "external"
      ? "external"
      : globalSettings?.aiSettings?.imageProvider ||
        globalSettings?.imageSettings?.provider ||
        "gemini";
  const audioProvider =
    globalSettings?.aiSettings?.audioProvider ||
    globalSettings?.voiceSettings?.provider ||
    "gemini";
  const codecraftCfg =
    globalSettings?.aiSettings?.externalApi ||
    globalSettings?.aiSettings?.codecraft ||
    null;

  const channels = globalSettings?.channels || [];
  const activeChannel =
    channels.find((c) => c.id === (narrative.channelId || globalSettings?.defaultChannelId)) ||
    channels[0] ||
    null;

  const [scenePaceSec, setScenePaceSec] = useState(5);

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (_) {}
  };

  const goToStage = async (targetStage) => {
    setShowInlineChannels(false);
    if (targetStage === 9) {
      await onOpenVideoEditor();
      return;
    }
    if (targetStage > maxUnlocked) {
      showAlert(
        isAr
          ? "يرجى إكمال وتأكيد المرحلة الحالية أولاً قبل الانتقال للمراحل التالية."
          : "Please complete and confirm the current stage before unlocking future stages.",
        { title: isAr ? "المرحلة غير مفتوحة بعد" : "Stage Locked" }
      );
      return;
    }
    setStageError(null);
    updateNarrative((prev) => ({
      ...prev,
      currentStage: targetStage,
    }));
  };

  // --- Stage 1: YouTube Reference Analysis ---
  const handleThumbUpload = async (files) => {
    const file = files?.[0];
    if (!file) return;
    const dataUrl = await compressImageFile(file, 800, 0.75);
    if (!dataUrl) return;
    updateNarrative((prev) => ({
      ...prev,
      reference: {
        ...prev.reference,
        thumbnailUrl: dataUrl,
        thumbnailBase64: dataUrl,
        thumbnailMime: "image/jpeg",
      },
    }));
  };

  const handlePreviewYoutubeUrl = async () => {
    const url = narrative.reference?.youtubeUrl?.trim();
    if (!url) {
      setStageError(isAr ? "يرجى إدخال رابط يوتيوب صحيح." : "Please enter a YouTube URL.");
      return;
    }
    setBusyMsg(isAr ? "جاري جلب بيانات الفيديو المرجعي..." : "Fetching YouTube metadata...");
    setStageError(null);
    try {
      const meta = await fetchYouTubeMetadata(url);
      updateNarrative((prev) => ({
        ...prev,
        reference: {
          ...prev.reference,
          videoId: meta.videoId,
          title: prev.reference.title || meta.title || "",
          author: meta.author || "",
          description: meta.description || "",
          duration: meta.duration || "",
          views: meta.views || "",
          thumbnailUrl: meta.thumbnailUrl || prev.reference.thumbnailUrl,
          thumbnailBase64: meta.thumbnailBase64 || prev.reference.thumbnailBase64,
          thumbnailMime: meta.thumbnailMime || "image/jpeg",
          notice: meta.notice || "",
        },
      }));
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const handleAnalyzeAndContinue = async () => {
    const ref = narrative.reference || {};
    if (!ref.youtubeUrl?.trim() && !ref.title?.trim() && !ref.pastedTranscript?.trim()) {
      setStageError(
        isAr
          ? "يرجى إدخال رابط فيديو يوتيوب أو عنوان مرجعي للبدء في التحليل."
          : "Please enter a YouTube URL, reference title, or transcript to analyze."
      );
      return;
    }
    setBusyMsg(
      isAr
        ? "جاري تحليل المرجع والصورة المصغرة وتوليد 5 أفكار أصلية..."
        : "Analyzing reference & thumbnail vision and generating 5 original concepts..."
    );
    setStageError(null);
    try {
      let meta = {};
      if (ref.youtubeUrl?.trim() && !ref.thumbnailBase64) {
        try {
          meta = await fetchYouTubeMetadata(ref.youtubeUrl.trim());
        } catch (metaErr) {
          // If URL is invalid, stop and show error
          throw metaErr;
        }
      }
      const mergedRef = {
        ...ref,
        title: ref.title || meta.title || "",
        author: meta.author || ref.author || "",
        description: meta.description || ref.description || "",
        duration: meta.duration || ref.duration || "",
        views: meta.views || ref.views || "",
        thumbnailUrl: ref.thumbnailUrl || meta.thumbnailUrl || "",
        thumbnailBase64: ref.thumbnailBase64 || meta.thumbnailBase64 || null,
        thumbnailMime: ref.thumbnailMime || meta.thumbnailMime || "image/jpeg",
        notice: meta.notice || ref.notice || "",
      };

      const aiRes = await analyzeReferenceAndConcepts({
        projectName: currentProject?.name || "My Awesome Project",
        youtubeUrl: mergedRef.youtubeUrl,
        referenceTitle: mergedRef.title,
        channelName: mergedRef.author,
        description: mergedRef.description,
        pastedTranscript: mergedRef.pastedTranscript,
        nichePreference: mergedRef.nichePreference,
        languagePreference: mergedRef.languagePreference,
        thumbnailBase64: mergedRef.thumbnailBase64,
        thumbnailMime: mergedRef.thumbnailMime,
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });

      updateNarrative((prev) => ({
        ...prev,
        reference: { ...mergedRef, analyzedAt: Date.now() },
        analysis: aiRes.analysis,
        visualStyleLock: {
          ...(aiRes.visualStyleLock || prev.visualStyleLock),
          approved: true,
        },
        concepts: aiRes.concepts || [],
        selectedConceptId: aiRes.concepts?.[0]?.id || null,
        selectedConcept: aiRes.concepts?.[0] || null,
        currentStage: 2,
        maxUnlockedStage: Math.max(prev.maxUnlockedStage || 1, 2),
      }));
      setConceptTab("concepts");
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  // --- Stage 2: Concept Selection & Visual Style Lock ---
  const handleSelectConcept = async (concept) => {
    const changingExisting =
      narrative.selectedConceptId &&
      narrative.selectedConceptId !== concept.id &&
      narrative.approvedScript;
    if (changingExisting) {
      const ok = await showConfirm(
        isAr
          ? "تغيير الفكرة المختارة سيجعل السيناريو والمشاهد السابقة بحاجة لإعادة توليد. هل تريد المتابعة؟"
          : "Changing the selected concept will mark the existing script and downstream scenes as outdated. Continue?",
        { title: isAr ? "تحديث الفكرة المختارة" : "Change Active Concept" }
      );
      if (!ok) return;
    }
    updateNarrative((prev) => ({
      ...prev,
      selectedConceptId: concept.id,
      selectedConcept: concept,
      outdated: changingExisting
        ? { ...prev.outdated, script: true, scenes: true, imagePrompts: true, motionPrompts: true, seo: true }
        : prev.outdated,
    }));
  };

  const handleRegenerateConcepts = async () => {
    setBusyMsg(isAr ? "جاري توليد 5 أفكار جديدة..." : "Generating 5 fresh concept proposals...");
    setStageError(null);
    try {
      const res = await regenerateConcepts(narrative.analysis, "", textProvider, codecraftCfg);
      if (Array.isArray(res.concepts) && res.concepts.length) {
        updateNarrative((prev) => ({
          ...prev,
          concepts: res.concepts,
          selectedConceptId: res.concepts[0].id,
          selectedConcept: res.concepts[0],
        }));
      }
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const handleConfirmConceptToConfig = () => {
    if (!narrative.selectedConcept) {
      setStageError(isAr ? "يرجى اختيار فكرة واحدة للمتابعة." : "Please select a concept to continue.");
      return;
    }
    updateNarrative((prev) => ({
      ...prev,
      currentStage: 3,
      maxUnlockedStage: Math.max(prev.maxUnlockedStage || 2, 3),
    }));
  };

  // --- Stage 3: Configure Video & Generate Script ---
  const scriptPresets =
    narrative.config?.settingsSnapshot?.scriptPresets ||
    globalSettings?.scriptPresets ||
    [];
  const visualPresets =
    narrative.config?.settingsSnapshot?.visualPresets ||
    globalSettings?.visualPresets ||
    [];

  const activeScriptPreset =
    scriptPresets.find((p) => p.id === narrative.config?.scriptPresetId) || scriptPresets[0];
  const activeVisualPreset =
    visualPresets.find((p) => p.id === narrative.config?.visualPresetId) || visualPresets[0];

  const estimatedWords = Math.round((Number(narrative.config?.targetDurationMinutes) || 12) * 145);

  const handleSelectChannelForProject = (channel) => {
    if (!channel) return;
    updateNarrative((prev) => ({
      ...prev,
      channelId: channel.id,
      config: {
        ...prev.config,
        aspectRatio: channel.aspectRatio || prev.config?.aspectRatio || "16:9",
        voiceId: channel.voiceId || prev.config?.voiceId || "onyx",
      },
    }));
    if (applyChannelEditorPresets) {
      applyChannelEditorPresets(channel);
    }
  };

  const handleConfirmConfigAndGenerateScript = async () => {
    if (activeChannel && applyChannelEditorPresets) {
      applyChannelEditorPresets(activeChannel);
    }
    if (narrative.scriptDraft && narrative.scriptDraft.trim().length > 20) {
      const ok = await showConfirm(
        isAr
          ? "يوجد سيناريو حالي في المشروع. هل تريد توليد سيناريو جديد واستبداله؟"
          : "A script already exists. Generate a new script and replace current draft?",
        { okText: isAr ? "نعم، ولّد سيناريو جديد" : "Generate New Script" }
      );
      if (!ok) {
        updateNarrative((prev) => ({
          ...prev,
          channelId: activeChannel?.id || prev.channelId,
          config: {
            ...prev.config,
            aspectRatio: activeChannel?.aspectRatio || prev.config?.aspectRatio || "16:9",
            confirmed: true,
          },
          currentStage: 4,
          maxUnlockedStage: Math.max(prev.maxUnlockedStage || 3, 4),
        }));
        return;
      }
    }
    setBusyMsg(
      isAr
        ? `جاري كتابة السيناريو الكامل حسب ستايل قناة "${activeChannel?.name || ""}" (~${estimatedWords} كلمة)...`
        : `Generating full narration script following "${activeChannel?.name || "Channel"}" rules (~${estimatedWords} words)...`
    );
    setStageError(null);
    try {
      const effectiveConcept = narrative.selectedConcept || narrative.concepts?.[0] || {
        title: narrative.reference?.title || "Original Documentary",
        premise: narrative.reference?.description || narrative.analysis?.curiosityGap || "Investigative documentary exploring intriguing questions.",
        niche: activeChannel?.niche || narrative.analysis?.niche || "Documentary",
        mainHook: narrative.analysis?.openingHook || "",
        storyStructure: narrative.analysis?.storytellingStructure || "",
        narrationStyle: activeChannel?.narrationStyle || narrative.analysis?.narrationTone || "",
        payoff: "",
      };

      const res = await generateOrEditScript({
        concept: effectiveConcept,
        analysis: narrative.analysis,
        targetDurationMinutes: narrative.config?.targetDurationMinutes || 12,
        scriptPreset: activeScriptPreset,
        channelProfile: activeChannel,
        language: narrative.config?.language || (isAr ? "Arabic (العربية)" : "English (US)"),
        customScriptPrompt: narrative.config?.customScriptPrompt || "",
        action: "generate",
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });

      if (!res.script || res.script.trim().length === 0) {
        throw new Error(isAr ? "لم يتم استلام نص السيناريو من الموديل، يرجى إعادة المحاولة." : "Empty script response received from model.");
      }

      updateNarrative((prev) => ({
        ...prev,
        channelId: activeChannel?.id || prev.channelId,
        config: {
          ...prev.config,
          aspectRatio: activeChannel?.aspectRatio || prev.config?.aspectRatio || "16:9",
          confirmed: true,
        },
        scriptDraft: res.script,
        outdated: { ...prev.outdated, script: false, scenes: true },
        currentStage: 4,
        maxUnlockedStage: Math.max(prev.maxUnlockedStage || 3, 4),
      }));
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  // --- Stage 4: Script Editing & Approval ---
  const scriptWordCount = useMemo(() => {
    const txt = (narrative.scriptDraft || "").trim();
    if (!txt) return 0;
    return txt.split(/\s+/).filter(Boolean).length;
  }, [narrative.scriptDraft]);

  const scriptEstSec = Math.round((scriptWordCount / 145) * 60);

  const handleScriptAiTool = async (action) => {
    // If not "generate", require existing script draft
    if (action !== "generate" && !narrative.scriptDraft?.trim()) return;
    setBusyMsg(
      isAr ? `جاري تطبيق أداة السيناريو (${action})...` : `Running script AI tool (${action})...`
    );
    setStageError(null);
    try {
      const effectiveConcept = narrative.selectedConcept || narrative.concepts?.[0] || {
        title: narrative.reference?.title || "Original Documentary",
        premise: narrative.reference?.description || narrative.analysis?.curiosityGap || "Investigative documentary.",
        niche: activeChannel?.niche || narrative.analysis?.niche || "Documentary",
        mainHook: narrative.analysis?.openingHook || "",
        storyStructure: narrative.analysis?.storytellingStructure || "",
        narrationStyle: activeChannel?.narrationStyle || narrative.analysis?.narrationTone || "",
        payoff: "",
      };

      const res = await generateOrEditScript({
        concept: effectiveConcept,
        analysis: narrative.analysis,
        targetDurationMinutes: narrative.config?.targetDurationMinutes || 12,
        scriptPreset: activeScriptPreset,
        channelProfile: activeChannel,
        language: narrative.config?.language || (isAr ? "Arabic (العربية)" : "English (US)"),
        customScriptPrompt: narrative.config?.customScriptPrompt || "",
        action,
        currentScript: narrative.scriptDraft || "",
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });
      if (res.script) {
        updateNarrative((prev) => ({
          ...prev,
          scriptDraft: res.script,
          outdated: { ...prev.outdated, scenes: true },
        }));
      }
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const handleApproveScript = () => {
    if (!narrative.scriptDraft || narrative.scriptDraft.trim().length < 20) {
      setStageError(
        isAr
          ? "يرجى كتابة أو توليد السيناريو قبل اعتماده."
          : "Please generate or enter a valid narration script before approving."
      );
      return;
    }
    const scriptChanged =
      narrative.approvedScript && narrative.approvedScript !== narrative.scriptDraft;
    updateNarrative((prev) => ({
      ...prev,
      approvedScript: prev.scriptDraft,
      scriptApprovedAt: Date.now(),
      outdated: scriptChanged
        ? { ...prev.outdated, script: false, scenes: true, imagePrompts: true }
        : { ...prev.outdated, script: false },
      currentStage: 5,
      maxUnlockedStage: Math.max(prev.maxUnlockedStage || 4, 5),
    }));
  };

  // --- Stage 5: Upload Voice-Over Audio & Automatically Extract Authoritative Duration ---
  const effectiveAudioSec = useMemo(() => {
    if (audioDuration > 0) return Math.round(audioDuration * 10) / 10;
    const manualSec = parseDurationInput(narrative.manualDurationInput);
    if (manualSec > 0) return manualSec;
    if (narrative.actualDurationSec > 0) return narrative.actualDurationSec;
    return scriptEstSec || (narrative.config?.targetDurationMinutes || 12) * 60;
  }, [
    audioDuration,
    narrative.manualDurationInput,
    narrative.actualDurationSec,
    scriptEstSec,
    narrative.config?.targetDurationMinutes,
  ]);

  const handleGenerateAiVoiceover = async () => {
    const scriptText = (narrative.approvedScript || narrative.scriptDraft || "").trim();
    if (!scriptText) {
      setStageError(
        isAr
          ? "لا يوجد نص سيناريو لتوليد التعليق الصوتي منه."
          : "No script text available to generate voice-over audio."
      );
      return;
    }
    const voiceName =
      activeChannel?.voiceId ||
      narrative.config?.voiceId ||
      globalSettings?.voiceSettings?.voiceId ||
      codecraftCfg?.ttsVoice ||
      "onyx";
    setBusyMsg(
      isAr
        ? `جاري توليد التعليق الصوتي بالذكاء الاصطناعي (${voiceName})...`
        : `Generating AI voice-over narration (${voiceName})...`
    );
    setStageError(null);
    try {
      const res = await generateVoiceoverTTS(
        scriptText,
        voiceName,
        audioProvider,
        codecraftCfg
      );
      if (res?.audioDataUrl) {
        const fetchRes = await fetch(res.audioDataUrl);
        const blob = await fetchRes.blob();
        const ext = res.mimeType?.includes("wav") ? "wav" : "mp3";
        const file = new File([blob], `ai_voiceover_${voiceName}.${ext}`, {
          type: res.mimeType || "audio/wav",
        });
        if (onAudio) {
          await onAudio([file]);
        }
      }
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const handleConfirmAudioAndTiming = async () => {
    if (!(effectiveAudioSec > 0)) {
      setStageError(
        isAr
          ? "يرجى رفع ملف صوتي أو إدخال مدة الصوت الفعلية (مثال 12:55)."
          : "Please upload narration audio, generate TTS, or enter the actual duration (e.g., 12:55)."
      );
      return;
    }

    const durationChanged =
      narrative.actualDurationSec > 0 &&
      Math.abs(narrative.actualDurationSec - effectiveAudioSec) > 1 &&
      narrative.scenes?.length > 0;

    let updatedScenes = narrative.scenes || [];
    if (durationChanged) {
      const recalc = await showConfirm(
        isAr
          ? `تغيرت مدة الصوت الفعلية إلى ${formatDurationClock(
              effectiveAudioSec
            )}. هل تريد إعادة حساب توقيت جميع المشاهد تلقائياً؟`
          : `Actual narration duration changed to ${formatDurationClock(
              effectiveAudioSec
            )}. Recalculate all scene timestamps to match?`,
        { okText: isAr ? "إعادة حساب التوقيت" : "Recalculate Timings" }
      );
      if (recalc) {
        updatedScenes = recalculateSceneTimings(updatedScenes, effectiveAudioSec);
      }
    }

    // If no scenes exist yet, generate scene breakdown automatically
    if (!updatedScenes.length) {
      setBusyMsg(
        isAr
          ? "جاري تقسيم السيناريو إلى مشاهد متسلسلة..."
          : "Splitting approved script into timed visual scenes..."
      );
      setStageError(null);
      try {
        const res = await generateSceneBreakdown({
          script: narrative.approvedScript || narrative.scriptDraft,
          actualDurationSec: effectiveAudioSec,
          concept: narrative.selectedConcept,
          visualStylePreset: activeVisualPreset,
          channelProfile: activeChannel,
          targetSecondsPerScene: scenePaceSec,
          provider: textProvider,
          codecraftConfig: codecraftCfg,
        });
        updatedScenes = res.scenes || [];
      } catch (err) {
        setStageError(err.message || String(err));
        setBusyMsg(null);
        return;
      } finally {
        setBusyMsg(null);
      }
    }

    updateNarrative((prev) => ({
      ...prev,
      actualDurationSec: effectiveAudioSec,
      audioConfirmed: true,
      scenes: updatedScenes,
      outdated: { ...prev.outdated, audio: false, scenes: false },
      currentStage: 6,
      maxUnlockedStage: Math.max(prev.maxUnlockedStage || 5, 6),
    }));
  };

  // --- Stage 6: Scene Breakdown & Scene Tools ---
  const handleRegenerateScenes = async () => {
    setBusyMsg(
      isAr
        ? `جاري تقسيم السيناريو إلى مشاهد متوازنة (مشهد كل ~${scenePaceSec} ثوانٍ)...`
        : `Generating balanced scene breakdown (~1 scene every ${scenePaceSec}s)...`
    );
    setStageError(null);
    try {
      const res = await generateSceneBreakdown({
        script: narrative.approvedScript || narrative.scriptDraft,
        actualDurationSec: narrative.actualDurationSec || effectiveAudioSec,
        concept: narrative.selectedConcept,
        visualStylePreset: activeVisualPreset,
        channelProfile: activeChannel,
        targetSecondsPerScene: scenePaceSec,
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });
      updateNarrative((prev) => ({
        ...prev,
        scenes: res.scenes || [],
        outdated: { ...prev.outdated, scenes: false, imagePrompts: true, motionPrompts: true },
      }));
      setSelectedSceneIdx(0);
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const handleEditScene = async (idx) => {
    const sc = narrative.scenes?.[idx];
    if (!sc) return;
    const desc = await showPrompt(
      isAr ? `تعديل الوصف البصري للمشهد ${sc.sceneNumber}:` : `Edit Visual Description for Scene ${sc.sceneNumber}:`,
      {
        title: `Scene ${sc.sceneNumber}`,
        defaultValue: sc.visualDescription || "",
        okText: isAr ? "حفظ" : "Save",
      }
    );
    if (desc != null && desc.trim()) {
      updateNarrative((prev) => {
        const next = [...prev.scenes];
        next[idx] = { ...sc, visualDescription: desc.trim(), promptOutdated: true };
        return {
          ...prev,
          scenes: next,
          outdated: { ...prev.outdated, imagePrompts: true },
        };
      });
    }
  };

  const handleMergeWithNext = (idx) => {
    const list = narrative.scenes || [];
    if (idx < 0 || idx >= list.length - 1) return;
    const a = list[idx];
    const b = list[idx + 1];
    const merged = {
      ...a,
      scriptExcerpt: `${a.scriptExcerpt} ${b.scriptExcerpt}`.trim(),
      visualDescription: `${a.visualDescription} — ${b.visualDescription}`.trim(),
    };
    const nextList = [...list.slice(0, idx), merged, ...list.slice(idx + 2)];
    const retimed = recalculateSceneTimings(
      nextList,
      narrative.actualDurationSec || effectiveAudioSec
    );
    updateNarrative((prev) => ({
      ...prev,
      scenes: retimed,
      outdated: { ...prev.outdated, imagePrompts: true, motionPrompts: true },
    }));
  };

  const handleSplitScene = (idx) => {
    const list = narrative.scenes || [];
    const sc = list[idx];
    if (!sc) return;
    const words = String(sc.scriptExcerpt || "").trim().split(/\s+/);
    if (words.length < 4) return;
    const mid = Math.ceil(words.length / 2);
    const firstHalf = {
      ...sc,
      id: `scene_${Date.now()}_a`,
      scriptExcerpt: words.slice(0, mid).join(" "),
    };
    const secondHalf = {
      ...sc,
      id: `scene_${Date.now()}_b`,
      scriptExcerpt: words.slice(mid).join(" "),
      visualDescription: `${sc.visualDescription} (closer detail angle)`,
      cameraFraming: "close-up shot",
    };
    const nextList = [...list.slice(0, idx), firstHalf, secondHalf, ...list.slice(idx + 1)];
    const retimed = recalculateSceneTimings(
      nextList,
      narrative.actualDurationSec || effectiveAudioSec
    );
    updateNarrative((prev) => ({
      ...prev,
      scenes: retimed,
      outdated: { ...prev.outdated, imagePrompts: true, motionPrompts: true },
    }));
  };

  const handleMoveScene = (idx, dir) => {
    const list = [...(narrative.scenes || [])];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const temp = list[idx];
    list[idx] = list[target];
    list[target] = temp;
    const retimed = recalculateSceneTimings(
      list,
      narrative.actualDurationSec || effectiveAudioSec
    );
    updateNarrative((prev) => ({
      ...prev,
      scenes: retimed,
      outdated: { ...prev.outdated, imagePrompts: true },
    }));
    setSelectedSceneIdx(target);
  };

  const handleConfirmScenes = async () => {
    if (!narrative.scenes?.length) {
      setStageError(isAr ? "لا توجد مشاهد لاعتمادها." : "No scenes available to confirm.");
      return;
    }
    // If image prompts don't exist yet, generate them automatically from script + channel settings
    if (!narrative.imagePrompts?.length || narrative.outdated?.imagePrompts) {
      setBusyMsg(
        isAr
          ? `جاري توليد برومبتات الصور (Image Prompts) حسب السكريبت وإعدادات قناة "${activeChannel?.name || ""}"...`
          : `Generating standalone Image Prompts from script & "${activeChannel?.name || "Channel"}" settings...`
      );
      setStageError(null);
      try {
        const imgRes = await generateImagePromptsBatch({
          scenes: narrative.scenes,
          script: narrative.approvedScript || narrative.scriptDraft || "",
          visualStyleLock: narrative.visualStyleLock,
          visualStylePreset: activeVisualPreset,
          channelProfile: activeChannel,
          aspectRatio: activeChannel?.aspectRatio || narrative.config?.aspectRatio || "16:9",
          negativePrompt: narrative.config?.negativePrompt || "no text in this frame",
          batchSize: globalSettings?.imageSettings?.batchSize || 20,
          provider: textProvider,
          codecraftConfig: codecraftCfg,
        });
        updateNarrative((prev) => ({
          ...prev,
          scenesConfirmed: true,
          imagePrompts: imgRes.prompts || [],
          imagePromptsConfirmed: true,
          outdated: { ...prev.outdated, imagePrompts: false },
          currentStage: 7,
          maxUnlockedStage: Math.max(prev.maxUnlockedStage || 6, 8),
        }));
        return;
      } catch (err) {
        setStageError(err.message || String(err));
        return;
      } finally {
        setBusyMsg(null);
      }
    }

    updateNarrative((prev) => ({
      ...prev,
      scenesConfirmed: true,
      currentStage: 7,
      maxUnlockedStage: Math.max(prev.maxUnlockedStage || 6, 7),
    }));
  };

  // --- Stage 7: Image Prompts Only (Generated from Script & Channel Settings) ---
  const handleRegenerateAllPrompts = async () => {
    setBusyMsg(
      isAr
        ? `جاري توليد برومبتات الصور حسب السكريبت وإعدادات قناة "${activeChannel?.name || ""}"...`
        : `Generating standalone Image Prompts from script & "${activeChannel?.name || "Channel"}" settings...`
    );
    setStageError(null);
    try {
      const imgRes = await generateImagePromptsBatch({
        scenes: narrative.scenes,
        script: narrative.approvedScript || narrative.scriptDraft || "",
        visualStyleLock: narrative.visualStyleLock,
        visualStylePreset: activeVisualPreset,
        channelProfile: activeChannel,
        aspectRatio: activeChannel?.aspectRatio || narrative.config?.aspectRatio || "16:9",
        negativePrompt: narrative.config?.negativePrompt || "no text in this frame",
        batchSize: globalSettings?.imageSettings?.batchSize || 20,
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });
      updateNarrative((prev) => ({
        ...prev,
        imagePrompts: imgRes.prompts || [],
        outdated: { ...prev.outdated, imagePrompts: false },
      }));
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const handleRegenerateSinglePrompt = async (scene) => {
    if (!scene) return;
    setBusyMsg(
      isAr
        ? `جاري إعادة توليد برومبت الصورة للمشهد ${scene.sceneNumber} حسب السكريبت وإعدادات القناة...`
        : `Regenerating Image Prompt for Scene ${scene.sceneNumber} from script & channel settings...`
    );
    setStageError(null);
    try {
      const imgRes = await generateImagePromptsBatch({
        scenes: [scene],
        script: narrative.approvedScript || narrative.scriptDraft || "",
        visualStyleLock: narrative.visualStyleLock,
        visualStylePreset: activeVisualPreset,
        channelProfile: activeChannel,
        aspectRatio: activeChannel?.aspectRatio || narrative.config?.aspectRatio || "16:9",
        negativePrompt: narrative.config?.negativePrompt || "no text in this frame",
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });
      const newIp = imgRes.prompts?.[0];
      if (newIp) {
        updateNarrative((prev) => ({
          ...prev,
          imagePrompts: prev.imagePrompts.some((p) => p.sceneId === scene.id)
            ? prev.imagePrompts.map((p) => (p.sceneId === scene.id ? newIp : p))
            : [...prev.imagePrompts, newIp],
        }));
      }
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const handleExportPromptsTxt = () => {
    const lines = (narrative.scenes || []).map((s) => {
      const ip = (narrative.imagePrompts || []).find((p) => p.sceneId === s.id);
      return [
        `=== Scene ${s.sceneNumber} (${formatDurationClock(s.startTime)} - ${formatDurationClock(s.endTime)} · ${s.duration}s) ===`,
        ip?.prompt || "",
        "",
      ].join("\n");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(currentProject?.name || "image_prompts").replace(/[^\w.-]+/g, "_")}_image_prompts.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleConfirmPromptsToAssets = () => {
    updateNarrative((prev) => ({
      ...prev,
      imagePromptsConfirmed: true,
      motionPromptsConfirmed: true,
      currentStage: 8,
      maxUnlockedStage: Math.max(prev.maxUnlockedStage || 7, 10),
    }));
  };

  // --- Stage 8: Assets Upload & Scene Matching ---
  const handleSceneAssetUpload = async (scene, file) => {
    if (!file || !scene) return;
    // Rename file with exact scene start timestamp so existing timeline engine matches it seamlessly
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const tsName = `${formatFilenameTimestamp(scene.startTime)}.${ext}`;
    const stampedFile = new File([file], tsName, { type: file.type || "image/png" });
    await addImages([stampedFile]);
  };

  const handleGenerateSceneAiImage = async (scene) => {
    if (!scene) return;
    const ipObj = (narrative.imagePrompts || []).find((p) => p.sceneId === scene.id);
    const promptText = (ipObj?.prompt || scene.visualDescription || "").trim();
    if (!promptText) {
      setStageError(
        isAr
          ? "لا يوجد برومبت صورة لهذا المشهد."
          : "No image prompt available for this scene."
      );
      return;
    }
    setBusyMsg(
      isAr
        ? `جاري توليد صورة المشهد ${scene.sceneNumber} بالذكاء الاصطناعي...`
        : `Generating AI image for Scene ${scene.sceneNumber}...`
    );
    setStageError(null);
    try {
      const res = await generateSceneImage({
        prompt: promptText,
        aspectRatio: activeChannel?.aspectRatio || narrative.config?.aspectRatio || "16:9",
        provider: imageProvider,
        codecraftConfig: codecraftCfg,
      });
      if (res?.imageDataUrl) {
        const fetchRes = await fetch(res.imageDataUrl);
        const blob = await fetchRes.blob();
        const ext = res.mimeType?.includes("jpeg") ? "jpg" : "png";
        const file = new File([blob], `scene_${scene.sceneNumber}.${ext}`, {
          type: res.mimeType || "image/png",
        });
        await handleSceneAssetUpload(scene, file);
      }
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const handleBulkSceneAssetsUpload = async (fileList) => {
    const rawFiles = Array.from(fileList || []);
    if (!rawFiles.length) return;
    const scenes = narrative.scenes || [];

    // Sort files using natural folder sorting (numeric: true) so 1.png, 2.png, 10.png or 0-00.png, 0-05.png stay in exact folder order
    const sortedFiles = [...rawFiles].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    const processedFiles = sortedFiles.map((file, idx) => {
      const targetScene = scenes[idx];
      if (targetScene) {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const tsName = `${formatFilenameTimestamp(targetScene.startTime)}.${ext}`;
        const stamped = new File([file], tsName, { type: file.type || "image/png" });
        stamped.originalName = file.name;
        return stamped;
      }
      return file;
    });
    await addImages(processedFiles);
  };

  const handleContinueFromAssetsToEditor = async () => {
    if (syncScenesToEditorSlots) {
      await syncScenesToEditorSlots();
    }
    updateNarrative((prev) => ({
      ...prev,
      assetsConfirmed: true,
      status: "Ready for Editing",
      currentStage: 9,
      maxUnlockedStage: 10,
    }));
    onOpenVideoEditor();
  };

  // --- Stage 10: Generate YouTube SEO Metadata & 3 Channel-Styled Thumbnail Prompts ---
  const handleGenerateStage10Seo = async () => {
    setBusyMsg(
      isAr
        ? `جاري توليد عنوان الفيديو والوصف والكلمات المفتاحية و 3 برومبتات للصورة المصغرة حسب قناة "${activeChannel?.name || ""}"...`
        : `Generating YouTube SEO Titles, Description, Chapters, Tags & 3 Thumbnail Prompts for "${activeChannel?.name || "Channel"}"...`
    );
    setStageError(null);
    try {
      const pkg = await generateSeoPackage({
        projectName: currentProject?.name || "Untitled Project",
        concept: narrative.selectedConcept,
        niche: activeChannel?.niche || narrative.selectedConcept?.niche || narrative.analysis?.niche || "Documentary",
        script: narrative.approvedScript || narrative.scriptDraft || "",
        scenes: narrative.scenes || [],
        actualDurationSec: narrative.actualDurationSec || effectiveAudioSec,
        language: narrative.config?.language || "English (US)",
        channelProfile: activeChannel,
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });
      updateNarrative((prev) => ({
        ...prev,
        seoPackage: pkg,
        outdated: { ...prev.outdated, seo: false },
      }));
    } catch (err) {
      setStageError(err.message || String(err));
    } finally {
      setBusyMsg(null);
    }
  };

  const activeScene = narrative.scenes?.[selectedSceneIdx] || narrative.scenes?.[0] || null;
  const activeImagePrompt =
    narrative.imagePrompts?.find((p) => p.sceneId === activeScene?.id) || null;
  const activeMotionPrompt =
    narrative.motionPrompts?.find((m) => m.sceneId === activeScene?.id) || null;

  return (
    <div className="uyns-shell" dir={isAr ? "rtl" : "ltr"}>
      {/* Left Sidebar */}
      <aside className="uyns-sidebar">
        <div className="uyns-sidebar__brand">
          <div className="uyns-brand-icon">
            <Play className="w-4 h-4 fill-current" />
          </div>
          <div className="uyns-brand-text">
            <span className="uyns-brand-title">Universal YouTube</span>
            <span className="uyns-brand-sub">Narrative Studio</span>
          </div>
        </div>

        <nav className="uyns-sidebar__nav">
          <button type="button" onClick={backToProjects} className="uyns-nav-item">
            <Home className="w-4 h-4" />
            <span>{isAr ? "الرئيسية" : "Home"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInlineChannels(false)}
            className={`uyns-nav-item ${!showInlineChannels ? "is-active" : ""}`}
          >
            <FolderPlus className="w-4 h-4" />
            <span className="truncate">{currentProject?.name || "Active Project"}</span>
          </button>

          <button type="button" onClick={backToProjects} className="uyns-nav-item">
            <Folders className="w-4 h-4" />
            <span>{isAr ? "مشاريعي" : "My Projects"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInlineChannels((v) => !v)}
            className={`uyns-nav-item ${showInlineChannels ? "is-active" : ""}`}
          >
            <Tv className="w-4 h-4 text-[var(--accent)]" />
            <span>{isAr ? "القنوات والستايلات" : "Channels & Styles"}</span>
          </button>

          <button type="button" onClick={openSettingsFromWorkspace} className="uyns-nav-item">
            <Settings className="w-4 h-4" />
            <span>{isAr ? "الإعدادات" : "Settings"}</span>
          </button>
        </nav>

        <div className="uyns-sidebar__footer">
          <button
            type="button"
            className="uyns-btn uyns-btn--ghost uyns-btn--sm w-full justify-center"
            onClick={onOpenSeoModal}
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{isAr ? "حزمة سيو يوتيوب" : "YouTube SEO"}</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="uyns-main">
        {/* Top Bar with Project Name, Quick Demo Loader, Theme, Language */}
        <header className="uyns-topbar">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={backToProjects}
              className="uyns-top-pill"
              title={isAr ? "العودة للمشاريع" : "Back to Dashboard"}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isAr ? "المشاريع" : "Projects"}</span>
            </button>
            <button
              type="button"
              onClick={onRenameProject}
              className="flex items-center gap-1.5 text-sm font-bold hover:text-[var(--accent)] transition-colors"
            >
              <span>{currentProject?.name || "Untitled Project"}</span>
              <Edit3 className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>

          <div className="uyns-topbar__actions">
            <button
              type="button"
              onClick={loadSampleDemo}
              disabled={loadingSample}
              className="uyns-top-pill text-[var(--accent)] border-[var(--line-glow)]"
              title="Load sample assets into project"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {loadingSample
                  ? isAr
                    ? "جاري التحميل..."
                    : "Loading..."
                  : isAr
                  ? "تجربة مشروع نموذجي"
                  : "Load Sample Demo"}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenSeoModal}
              className="uyns-top-pill"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--cyan)]" />
              <span>{isAr ? "السيو (SEO)" : "SEO Package"}</span>
            </button>

            {setTheme && (
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="uyns-top-pill"
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            )}

            {setUiLang && (
              <button
                type="button"
                onClick={() => setUiLang(uiLang === "en" ? "ar" : "en")}
                className="uyns-top-pill"
              >
                <Globe className="w-3.5 h-3.5 text-[var(--cyan)]" />
                <span>{uiLang === "en" ? "EN" : "عربي"}</span>
              </button>
            )}
          </div>
        </header>

        {/* Horizontal Stepper Bar matching reference screenshot */}
        <div className="uyns-stepper-bar">
          {WORKFLOW_STAGES.map((st, idx) => {
            const isCurrent = stage === st.id;
            const isDone = st.id < stage || (st.id <= maxUnlocked && st.id < stage);
            const isUnlocked = st.id <= maxUnlocked || st.id === 9 || st.id === 10;
            return (
              <div key={st.id} className="uyns-stepper-item-wrap">
                <button
                  type="button"
                  onClick={() => goToStage(st.id)}
                  className={`uyns-step-btn ${isCurrent ? "is-current" : ""} ${
                    isDone ? "is-done" : ""
                  } ${!isUnlocked ? "is-locked" : ""}`}
                >
                  <span className="uyns-step-circle">
                    {isDone ? <Check className="w-3.5 h-3.5" /> : st.id}
                  </span>
                  <span className="uyns-step-label">{isAr ? st.labelAr : st.labelEn}</span>
                </button>
                {idx < WORKFLOW_STAGES.length - 1 && <div className="uyns-step-line" />}
              </div>
            );
          })}
        </div>

        {/* Loading & Error Banners */}
        {busyMsg && (
          <div className="uyns-banner uyns-banner--busy mx-6 mt-4">
            <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
            <span>{busyMsg}</span>
          </div>
        )}
        {stageError && (
          <div className="uyns-banner uyns-banner--error mx-6 mt-4 flex flex-wrap items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-[var(--bad)] shrink-0" />
            <span className="flex-1 text-xs">{stageError}</span>
            {(stageError.includes("GEMINI_API_KEY") ||
              stageError.includes("CodeCraft") ||
              stageError.includes("API key")) &&
              openSettingsFromWorkspace && (
                <button
                  type="button"
                  onClick={openSettingsFromWorkspace}
                  className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{isAr ? "فتح الإعدادات" : "Open Settings"}</span>
                </button>
              )}
            <button type="button" onClick={() => setStageError(null)} className="text-xs underline">
              {isAr ? "إغلاق" : "Dismiss"}
            </button>
          </div>
        )}

        {/* Stage Content Body */}
        <div className="uyns-content-scroll">
          {showInlineChannels ? (
            <ChannelsView
              globalSettings={globalSettings}
              onSaveGlobalSettings={onSaveGlobalSettings}
              onBack={() => setShowInlineChannels(false)}
              uiLang={uiLang}
              embedded={true}
            />
          ) : (
            <>
          {/* ================================================================
              STAGE 1: NEW PROJECT — YOUTUBE REFERENCE ANALYSIS
              ================================================================ */}
          {stage === 1 && (
            <div className="uyns-stage-card">
              <h1 className="uyns-stage-title">
                {isAr
                  ? "إنشاء مشروع جديد — تحليل فيديو يوتيوب مرجعي"
                  : "Create New Project — YouTube Reference Analysis"}
              </h1>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
                <div className="lg:col-span-7 space-y-4">
                  <div className="uyns-field">
                    <label>{isAr ? "رابط فيديو يوتيوب (YouTube URL) *" : "YouTube URL *"}</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={narrative.reference?.youtubeUrl || ""}
                        onChange={(e) =>
                          updateNarrative((p) => ({
                            ...p,
                            reference: { ...p.reference, youtubeUrl: e.target.value },
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="uyns-btn uyns-btn--ghost uyns-btn--sm shrink-0"
                        onClick={handlePreviewYoutubeUrl}
                      >
                        {isAr ? "معاينة الرابط" : "Fetch Preview"}
                      </button>
                    </div>
                  </div>

                  <div className="uyns-field">
                    <label>{isAr ? "اسم المشروع *" : "Project Name *"}</label>
                    <input
                      type="text"
                      placeholder="My Awesome Project"
                      value={currentProject?.name || ""}
                      onChange={(e) => onRenameProject(e.target.value, true)}
                    />
                  </div>

                  {channels.length > 0 && (
                    <div className="uyns-field">
                      <label className="flex items-center justify-between">
                        <span>{isAr ? "قناة المشروع (تطبيق جميع ستايلات القناة)" : "Channel Profile (Applies channel styles & avatar)"}</span>
                        {openChannelsFromWorkspace && (
                          <button
                            type="button"
                            onClick={openChannelsFromWorkspace}
                            className="text-[11px] text-[var(--accent)] hover:underline"
                          >
                            {isAr ? "إدارة القنوات ←" : "Manage Channels →"}
                          </button>
                        )}
                      </label>
                      <select
                        value={narrative.channelId || activeChannel?.id || ""}
                        onChange={(e) => {
                          const chId = e.target.value;
                          const ch = channels.find((c) => c.id === chId);
                          updateNarrative((p) => ({
                            ...p,
                            channelId: chId,
                            config: {
                              ...p.config,
                              voiceId: ch?.voiceId || p.config?.voiceId || "onyx",
                              aspectRatio: ch?.aspectRatio || p.config?.aspectRatio || "16:9",
                            },
                          }));
                        }}
                      >
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.name} ({ch.niche})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="uyns-field">
                    <label>{isAr ? "رفع صورة مصغرة مخصصة (اختياري)" : "Upload Custom Thumbnail (Optional)"}</label>
                    <Dropzone
                      accept="image/*"
                      onFiles={handleThumbUpload}
                      icon="🖼️"
                      title={isAr ? "اضغط للرفع أو اسحب الصورة المصغرة هنا" : "Click to upload or drag & drop"}
                      hint="PNG, JPG, WEBP (Analyzed with Gemini Vision)"
                      filled={!!narrative.reference?.thumbnailBase64}
                      filledLabel={isAr ? "تم إرفاق الصورة المصغرة" : "Thumbnail attached for Vision AI"}
                    />
                  </div>

                  <div className="uyns-field">
                    <label>
                      {isAr
                        ? "نص التفريغ الصوتي أو ملاحظات الفيديو المرجعي (اختياري)"
                        : "Reference Transcript or Notes (Optional — for spoken pacing analysis)"}
                    </label>
                    <textarea
                      rows={3}
                      placeholder={
                        isAr
                          ? "الصق نص تفريغ الفيديو المرجعي أو ملاحظات إضافية هنا لتحليل أسلوب السرد والإيقاع بدقة..."
                          : "Paste the reference video's transcript or your notes here for deeper spoken-content and pacing analysis..."
                      }
                      value={narrative.reference?.pastedTranscript || ""}
                      onChange={(e) =>
                        updateNarrative((p) => ({
                          ...p,
                          reference: { ...p.reference, pastedTranscript: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Right Column: Quick Analysis Preview Card */}
                <div className="lg:col-span-5">
                  <div className="uyns-preview-card">
                    <div className="uyns-preview-card__thumb">
                      {narrative.reference?.thumbnailUrl ? (
                        <img
                          src={narrative.reference.thumbnailUrl}
                          alt="YouTube Reference Thumbnail"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="uyns-preview-card__empty">
                          <Play className="w-10 h-10 text-[var(--bad)]" />
                          <span className="text-xs text-[var(--muted)] mt-2">
                            {isAr ? "معاينة الصورة المصغرة للفيديو المرجعي" : "YouTube Reference Thumbnail Preview"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 mt-4">
                      <h3 className="text-sm font-bold">
                        {isAr ? "معاينة سريعة للمرجع" : "Quick Analysis Preview"}
                      </h3>
                      <div className="text-xs space-y-1 text-[var(--muted)]">
                        <div>
                          <strong className="text-[var(--text)]">Title:</strong>{" "}
                          {narrative.reference?.title || "Awaiting URL / input"}
                        </div>
                        <div>
                          <strong className="text-[var(--text)]">Channel:</strong>{" "}
                          {narrative.reference?.author || "—"}
                        </div>
                        {narrative.reference?.duration && (
                          <div>
                            <strong className="text-[var(--text)]">Duration:</strong>{" "}
                            {narrative.reference.duration}
                          </div>
                        )}
                        {activeChannel && (
                          <div>
                            <strong className="text-[var(--text)]">Active Style Kit:</strong>{" "}
                            <span className="text-[var(--accent)]">{activeChannel.name}</span>
                          </div>
                        )}
                      </div>

                      {narrative.reference?.notice && (
                        <p className="text-[11px] text-[var(--muted)] bg-[var(--panel-2)] p-2.5 rounded-lg border border-[var(--line-soft)]">
                          {narrative.reference.notice}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={!!busyMsg}
                        onClick={handleAnalyzeAndContinue}
                        className="uyns-btn uyns-btn--primary w-full justify-center mt-4 py-3"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>
                          {busyMsg
                            ? isAr
                              ? "جاري التحليل..."
                              : "Analyzing..."
                            : isAr
                            ? "تحليل ومتابعة ←"
                            : "Analyze & Continue →"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              STAGE 2: REFERENCE ANALYSIS RESULTS & 5 ORIGINAL CONCEPTS
              ================================================================ */}
          {stage === 2 && (
            <div className="uyns-stage-card">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--line)]">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-7 h-7 text-[var(--accent)]" />
                  <div>
                    <h1 className="text-lg font-extrabold">
                      {isAr ? "اكتمل التحليل بنجاح" : "Analysis Complete"}
                    </h1>
                    <p className="text-xs text-[var(--muted)]">
                      {isAr
                        ? "قمنا بتحليل المرجع وتوليد 5 أفكار أصلية مخصصة لمشروعك."
                        : "We've analyzed the reference and generated 5 original concepts for you."}
                    </p>
                  </div>
                </div>

                <div className="uyns-segmented">
                  <button
                    type="button"
                    onClick={() => setConceptTab("analysis")}
                    className={`uyns-segmented__btn ${conceptTab === "analysis" ? "is-active" : ""}`}
                  >
                    {isAr ? "تحليل المرجع" : "Reference Analysis"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConceptTab("concepts")}
                    className={`uyns-segmented__btn ${conceptTab === "concepts" ? "is-active" : ""}`}
                  >
                    {isAr ? "5 أفكار مقترحة" : "5 Concepts"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConceptTab("styleLock")}
                    className={`uyns-segmented__btn ${conceptTab === "styleLock" ? "is-active" : ""}`}
                  >
                    {isAr ? "قفل النمط البصري" : "Visual Style Lock"}
                  </button>
                </div>
              </div>

              {conceptTab === "styleLock" ? (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold">
                        {isAr
                          ? "قفل النمط البصري (Visual Style Lock)"
                          : "Visual Style Lock — Enforced Across All Scene Prompts"}
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        {isAr
                          ? "يمكنك مراجعة وتعديل القواعد البصرية أدناه؛ سيتم تضمينها تلقائياً في كل أمر صورة مستقل."
                          : "Review and customize these visual rules. They will be injected into every standalone scene prompt."}
                      </p>
                    </div>
                  </div>
                  <div className="uyns-form-grid">
                    {[
                      ["artStyle", isAr ? "النمط الفني" : "Art Style"],
                      ["characterRules", isAr ? "تصميم الشخصيات" : "Character Design Rules"],
                      ["facialVisibility", isAr ? "ملامح الوجه" : "Facial Visibility Rules"],
                      ["clothingSilhouette", isAr ? "الملابس والهيئة" : "Clothing & Silhouette"],
                      ["colorPalette", isAr ? "لوحة الألوان" : "Color Palette"],
                      ["lighting", isAr ? "الإضاءة" : "Lighting"],
                      ["backgroundTreatment", isAr ? "معالجة الخلفية" : "Background Treatment"],
                      ["composition", isAr ? "التكوين البصري" : "Composition"],
                      ["lineworkShading", isAr ? "الخطوط والتظليل" : "Linework & Shading"],
                      ["aspectRatio", isAr ? "أبعاد الإطار" : "Aspect Ratio"],
                    ].map(([key, label]) => (
                      <div key={key} className="uyns-field">
                        <label>{label}</label>
                        <input
                          type="text"
                          value={narrative.visualStyleLock?.[key] || ""}
                          onChange={(e) =>
                            updateNarrative((p) => ({
                              ...p,
                              visualStyleLock: { ...p.visualStyleLock, [key]: e.target.value },
                              outdated: { ...p.outdated, imagePrompts: true },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5">
                  {/* Left: Reference Analysis Report */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="uyns-card space-y-3">
                      <h2 className="text-sm font-bold">
                        {isAr ? "تقرير تحليل المرجع" : "Reference Analysis"}
                      </h2>
                      <ul className="space-y-2 text-xs leading-relaxed">
                        <li>
                          <strong className="text-[var(--muted)]">Main topic:</strong>{" "}
                          {narrative.analysis?.mainTopic || "—"}
                        </li>
                        <li>
                          <strong className="text-[var(--muted)]">Niche:</strong>{" "}
                          {narrative.analysis?.niche || "—"} / {narrative.analysis?.subNiche || ""}
                        </li>
                        <li>
                          <strong className="text-[var(--muted)]">Target audience:</strong>{" "}
                          {narrative.analysis?.targetAudience || "—"}
                        </li>
                        <li>
                          <strong className="text-[var(--muted)]">Curiosity gap:</strong>{" "}
                          {narrative.analysis?.curiosityGap || "—"}
                        </li>
                        <li>
                          <strong className="text-[var(--muted)]">Opening hook:</strong>{" "}
                          {narrative.analysis?.openingHook || "—"}
                        </li>
                        <li>
                          <strong className="text-[var(--muted)]">Style:</strong>{" "}
                          {narrative.analysis?.visualStyle || "—"}
                        </li>
                        <li>
                          <strong className="text-[var(--muted)]">Color palette:</strong>{" "}
                          {narrative.analysis?.colorPalette || "—"}
                        </li>
                        <li>
                          <strong className="text-[var(--muted)]">Tone & Pacing:</strong>{" "}
                          {narrative.analysis?.narrationTone || "—"}
                        </li>
                      </ul>

                      <div className="pt-2 border-t border-[var(--line-soft)]">
                        <h3 className="text-xs font-bold mb-1.5">
                          {isAr ? "عناصر الجذب الرئيسية:" : "Key Engagement Elements:"}
                        </h3>
                        <ul className="space-y-1 text-xs text-[var(--muted)]">
                          {(narrative.analysis?.engagementFactors || []).map((ef, i) => (
                            <li key={i}>✓ {ef}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Right: 5 Original Concepts */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold">
                        {isAr ? "5 أفكار أصلية مقترحة (اختر واحدة)" : "5 Original Concepts (Select One)"}
                      </h2>
                      <button
                        type="button"
                        disabled={!!busyMsg}
                        onClick={handleRegenerateConcepts}
                        className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{isAr ? "توليد أفكار أخرى" : "Regenerate 5 Concepts"}</span>
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {(narrative.concepts || []).map((c, idx) => {
                        const isSelected = narrative.selectedConceptId === c.id;
                        return (
                          <div
                            key={c.id || idx}
                            onClick={() => handleSelectConcept(c)}
                            className={`uyns-concept-card ${isSelected ? "is-selected" : ""}`}
                          >
                            <div className="uyns-concept-num">{idx + 1}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-bold truncate">{c.title}</h3>
                                <span className="text-[11px] text-[var(--muted)] shrink-0">
                                  {c.niche} · {c.subNiche}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">
                                {c.premise}
                              </p>
                              {isSelected && (
                                <div className="mt-2 pt-2 border-t border-[var(--line-soft)] text-[11px] space-y-1 text-[var(--text)]">
                                  <div>
                                    <strong>Hook:</strong> {c.mainHook}
                                  </div>
                                  <div>
                                    <strong>Visual Direction:</strong> {c.visualDirection}
                                  </div>
                                  <div>
                                    <strong>Payoff:</strong> {c.payoff}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center pt-3">
                      <button
                        type="button"
                        onClick={() => goToStage(1)}
                        className="uyns-btn uyns-btn--ghost"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>{isAr ? "السابق" : "Back"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmConceptToConfig}
                        className="uyns-btn uyns-btn--primary"
                      >
                        <span>{isAr ? "التالي: إعدادات الفيديو ←" : "Next: Configure Video →"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              STAGE 3: CONFIGURE VIDEO (ONLY DURATION + CHANNEL SELECTION)
              ================================================================ */}
          {stage === 3 && (
            <div className="uyns-stage-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="uyns-stage-title">
                    {isAr ? "إعداد الفيديو واختيار القناة (Configure Video)" : "Configure Video & Select Channel"}
                  </h1>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {isAr
                      ? "اختر مدة الفيديو والقناة فقط — سيتم استيراد طريقة السكريبت، ستايل الصور، تقسيم المشاهد، وإعدادات المونتاج (الفلاتر، التأثيرات، الموشن، والكتابة) تلقائياً من القناة المختارة."
                      : "Set target video duration and choose your Channel — scriptwriting style, image prompts, scene pacing, and Video Editor presets (filters, effects, motion, captions) are inherited automatically."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInlineChannels(true)}
                  className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                >
                  <Tv className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{isAr ? "إدارة القنوات أو إضافة قناة" : "Manage / Add Channel"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5">
                <div className="lg:col-span-7 space-y-5">
                  {/* 1. Target Video Duration */}
                  <div className="uyns-card space-y-3">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent)] block">
                      {isAr ? "1. تعيين مدة الفيديو المستهدفة *" : "1. Set Target Video Duration *"}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[3, 5, 8, 10, 12, 15, 20].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            updateNarrative((p) => ({
                              ...p,
                              config: { ...p.config, targetDurationMinutes: m },
                            }))
                          }
                          className={`uyns-dur-pill ${
                            narrative.config?.targetDurationMinutes === m ? "is-active" : ""
                          }`}
                        >
                          {m} {isAr ? "دقائق" : "min"}
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={narrative.config?.targetDurationMinutes || 12}
                          onChange={(e) =>
                            updateNarrative((p) => ({
                              ...p,
                              config: {
                                ...p.config,
                                targetDurationMinutes: Math.max(1, Number(e.target.value) || 8),
                              },
                            }))
                          }
                          className="w-20 rounded-lg bg-[var(--panel-2)] border border-[var(--line)] px-2.5 py-1.5 text-xs font-mono font-bold text-center"
                        />
                        <span className="text-xs text-[var(--muted)]">{isAr ? "دقيقة" : "min"}</span>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--muted)] block">
                      {isAr
                        ? `عدد الكلمات التقديري للسكريبت: ~${estimatedWords.toLocaleString()} كلمة (~${
                            narrative.config?.targetDurationMinutes || 12
                          } دقيقة)`
                        : `Estimated script length: ~${estimatedWords.toLocaleString()} words (~${
                            narrative.config?.targetDurationMinutes || 12
                          } min)`}
                    </span>
                  </div>

                    {/* 2. Select Channel Profile */}
                  <div className="uyns-card space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold uppercase tracking-wider text-slate-300 block">
                        {isAr ? "2. اختر القناة المعتمدة لهذا الفيديو *" : "2. Select Channel Profile *"}
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {channels.length} {isAr ? "قنوات متاحة" : "channels available"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {channels.map((ch) => {
                        const isSel = activeChannel?.id === ch.id;
                        const avatarThumb = ch.avatarImages?.[0]?.dataUrl;
                        const styleThumb = ch.styleReferenceImages?.[0]?.dataUrl;
                        const thumbBanner = ch.thumbnailReferenceImages?.[0]?.dataUrl || styleThumb;
                        const ed = ch.editorConfig || {};
                        return (
                          <div
                            key={ch.id}
                            onClick={() => handleSelectChannelForProject(ch)}
                            className={`group rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 ${
                              isSel
                                ? "border-indigo-500/80 bg-[#131826] shadow-[0_8px_30px_rgba(99,102,241,0.16)] ring-1 ring-indigo-500/40"
                                : "border-white/10 bg-[#0e131f] hover:border-white/25 hover:bg-[#131929]"
                            }`}
                          >
                            {/* Subtle Cover Banner */}
                            <div className="h-14 w-full relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border-b border-white/5">
                              {thumbBanner && (
                                <img
                                  src={thumbBanner}
                                  alt=""
                                  className="w-full h-full object-cover opacity-35 group-hover:scale-105 transition-transform duration-300"
                                />
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-[#0e131f] via-transparent to-transparent" />
                              <div className="absolute top-2 right-2.5 flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-black/60 text-slate-200 border border-white/10 backdrop-blur-sm">
                                  {ch.aspectRatio || "16:9"}
                                </span>
                                {isSel && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500 text-white shadow-sm">
                                    {isAr ? "مختارة ✓" : "Selected ✓"}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="p-3.5 pt-2 flex items-start gap-3">
                              <div className="-mt-6 w-12 h-12 rounded-xl overflow-hidden border-2 border-[#0e131f] bg-slate-800 shrink-0 flex items-center justify-center shadow-md relative z-10">
                                {avatarThumb || styleThumb ? (
                                  <img
                                    src={avatarThumb || styleThumb}
                                    alt={ch.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Tv className="w-5 h-5 text-indigo-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-xs font-extrabold text-slate-100 truncate">
                                  {ch.name}
                                </h3>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {ch.niche || "General Niche"}
                                </p>
                              </div>
                            </div>

                            <div className="px-3.5 pb-3 pt-1 flex flex-wrap gap-1.5 text-[10px] font-mono text-slate-300">
                              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10">
                                FX: {ed.effectPreset || "clean"}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10">
                                Tr: {ed.transitionType || "fade"}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10">
                                Cap: {ed.captionStyle?.presetId || "hormozi"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Language & Custom Prompts */}
                  <div className="uyns-card space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold uppercase tracking-wider text-slate-300 block">
                        {isAr ? "3. لغة السيناريو والتعليمات المخصصة" : "3. Script Language & Custom Directives"}
                      </label>
                    </div>

                    <div>
                      <span className="text-xs text-slate-300 block mb-1.5 font-medium">
                        {isAr ? "لغة كتابة السيناريو:" : "Narration Language:"}
                      </span>
                      <select
                        value={narrative.config?.language || (isAr ? "Arabic (العربية)" : "English (US)")}
                        onChange={(e) =>
                          updateNarrative((p) => ({
                            ...p,
                            config: { ...p.config, language: e.target.value },
                          }))
                        }
                        className="w-full text-xs font-medium"
                      >
                        <option value="Arabic (العربية)">العربية الفصحى (Arabic)</option>
                        <option value="English (US)">English (US)</option>
                        <option value="English (UK)">English (UK)</option>
                        <option value="Français (French)">Français (French)</option>
                        <option value="Español (Spanish)">Español (Spanish)</option>
                        <option value="Deutsch (German)">Deutsch (German)</option>
                      </select>
                    </div>

                    {/* Custom Script Directives / Prompts Textarea */}
                    <div className="pt-2">
                      <label className="text-xs text-slate-300 block mb-1 font-medium">
                        {isAr
                          ? "برومبت وتعليمات إضافية خاصة للسيناريو (اختياري — مثل حقائق محددة، نبرة معينة، أو مصطلحات):"
                          : "Custom Script Prompt & Specific Rules (Optional — tone, facts, keywords):"}
                      </label>
                      <textarea
                        rows={2}
                        value={narrative.config?.customScriptPrompt || ""}
                        onChange={(e) =>
                          updateNarrative((p) => ({
                            ...p,
                            config: { ...p.config, customScriptPrompt: e.target.value },
                          }))
                        }
                        placeholder={
                          isAr
                            ? "مثال: ركّز على جانب الغموض، ابدأ بسؤال صادم عن الاكتشاف، واستخدم تشبيهات بصرية قوية..."
                            : "e.g. Emphasize the mystery angle, open with an intriguing question, use vivid sensory metaphors..."
                        }
                        className="w-full text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Active Channel Automatic Blueprint Summary */}
                <div className="lg:col-span-5">
                  <div className="uyns-preview-card space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-100">
                        {isAr ? "إعدادات القناة المطبقة تلقائياً" : "Channel Auto-Applied Blueprint"}
                      </h2>
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        {activeChannel?.aspectRatio || "16:9"}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#0e131f] border border-white/10 space-y-2.5 text-xs">
                      <div className="font-extrabold text-sm text-white">
                        {activeChannel?.name || "Default Channel"}
                      </div>
                      <div className="text-slate-400">
                        <strong className="text-slate-200">{isAr ? "النيتش:" : "Niche:"}</strong>{" "}
                        {activeChannel?.niche || "—"}
                      </div>
                      <div className="text-slate-400">
                        <div className="flex items-center justify-between mb-1">
                          <strong className="text-slate-200">
                            {isAr ? "برومبت القناة الأساسي (Core Prompt Rules):" : "Core Prompt Rules:"}
                          </strong>
                          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            {isAr ? "مُطبّق وإلزامي 100%" : "Strictly Enforced"}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] text-slate-300 max-h-24 overflow-y-auto whitespace-pre-wrap font-sans">
                          {activeChannel?.promptRules || activeChannel?.visualStyleRules || "—"}
                        </div>
                      </div>
                      {activeChannel?.additionalScriptRules && (
                        <div className="text-slate-400">
                          <strong className="text-slate-200 block mb-0.5">Additional Script Rules:</strong>
                          <div className="p-1.5 rounded bg-black/30 border border-white/5 text-[11px] text-slate-300 max-h-16 overflow-y-auto whitespace-pre-wrap">
                            {activeChannel.additionalScriptRules}
                          </div>
                        </div>
                      )}
                      {activeChannel?.additionalSceneRules && (
                        <div className="text-slate-400">
                          <strong className="text-slate-200 block mb-0.5">Additional Scene Rules:</strong>
                          <div className="p-1.5 rounded bg-black/30 border border-white/5 text-[11px] text-slate-300 max-h-16 overflow-y-auto whitespace-pre-wrap">
                            {activeChannel.additionalSceneRules}
                          </div>
                        </div>
                      )}
                      {activeChannel?.additionalSceneRules && (
                        <div className="text-slate-400 line-clamp-2">
                          <strong className="text-slate-200">Additional Scene:</strong>{" "}
                          {activeChannel.additionalSceneRules}
                        </div>
                      )}
                      <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block">
                            {isAr ? "الفلتر والتأثير:" : "Filter & Effect:"}
                          </span>
                          <strong className="font-mono text-slate-200">
                            {activeChannel?.editorConfig?.effectPreset || "clean"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">
                            {isAr ? "الانتقال والموشن:" : "Transition & Motion:"}
                          </span>
                          <strong className="font-mono text-slate-200">
                            {activeChannel?.editorConfig?.transitionType || "fade"} ·{" "}
                            {activeChannel?.editorConfig?.motionStyle || "alternating"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">
                            {isAr ? "ستايل الكتابة:" : "Caption Style:"}
                          </span>
                          <strong className="font-mono text-slate-200">
                            {activeChannel?.editorConfig?.captionStyle?.presetId || "hormozi"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[var(--muted)] block">
                            {isAr ? "الصور المرجعية:" : "Reference Images:"}
                          </span>
                          <strong className="font-mono">
                            {(activeChannel?.styleReferenceImages?.length || 0) +
                              (activeChannel?.thumbnailReferenceImages?.length || 0)}{" "}
                            refs
                          </strong>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!!busyMsg}
                      onClick={handleConfirmConfigAndGenerateScript}
                      className="uyns-btn uyns-btn--primary w-full justify-center mt-4 py-3"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {busyMsg
                          ? isAr
                            ? "جاري توليد السكريبت..."
                            : "Generating Script..."
                          : isAr
                          ? "تأكيد القناة والمدة وتوليد السكريبت ←"
                          : "Confirm Channel & Generate Script →"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              STAGE 4: GENERATE & EDIT FULL NARRATION SCRIPT
              ================================================================ */}
          {stage === 4 && (
            <div className="uyns-stage-card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h1 className="uyns-stage-title">
                    {isAr ? "توليد وتحرير السيناريو الكامل" : "Generate Script"}
                  </h1>
                  <p className="text-xs text-[var(--muted)] font-mono">
                    Word count: {scriptWordCount.toLocaleString()} | Estimated time:{" "}
                    {formatDurationClock(scriptEstSec)}
                  </p>
                </div>
                {narrative.outdated?.script && (
                  <span className="text-xs text-amber-400 font-semibold">
                    {isAr ? "⚠ تم تغيير الفكرة — يرجى مراجعة السيناريو أو إعادة توليده" : "⚠ Concept changed — review or regenerate script"}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-9 space-y-3">
                  {!narrative.scriptDraft?.trim() && (
                    <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between gap-3 flex-wrap">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-indigo-300">
                          {isAr ? "السيناريو فارغ حالياً" : "No script generated yet"}
                        </span>
                        <p className="text-[11px] text-slate-300">
                          {isAr
                            ? `توليد السيناريو فوراً وفق إعدادات قناة "${activeChannel?.name || ""}" ونمط "${activeScriptPreset?.nameAr || activeScriptPreset?.name}".`
                            : `Generate the full script based on "${activeChannel?.name || "Channel"}" rules and "${activeScriptPreset?.name}" preset.`}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!!busyMsg}
                        onClick={() => handleScriptAiTool("generate")}
                        className="uyns-btn uyns-btn--primary uyns-btn--sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{busyMsg ? (isAr ? "جاري التوليد..." : "Generating...") : (isAr ? "توليد السيناريو الآن" : "Generate Script Now")}</span>
                      </button>
                    </div>
                  )}

                  <textarea
                    rows={16}
                    value={narrative.scriptDraft || ""}
                    onChange={(e) =>
                      updateNarrative((p) => ({
                        ...p,
                        scriptDraft: e.target.value,
                      }))
                    }
                    placeholder={
                      isAr
                        ? "سيظهر نص السيناريو الكامل هنا... يمكنك التعديل المباشر عليه."
                        : "Your complete voice-over narration script appears here. Edit directly..."
                    }
                    className="w-full rounded-xl bg-[var(--panel-2)] border border-[var(--line)] p-4 text-sm leading-relaxed font-sans"
                  />
                </div>

                {/* Script Tools Sidebar */}
                <div className="lg:col-span-3 space-y-2.5">
                  <div className="uyns-card space-y-2.5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                      {isAr ? "أدوات السيناريو" : "Script Tools"}
                    </h2>

                    <button
                      type="button"
                      disabled={!!busyMsg}
                      onClick={() => handleScriptAiTool("generate")}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <RefreshCw className="w-4 h-4 text-[var(--accent)]" />
                      <span>{isAr ? "إعادة التوليد" : "Regenerate"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!!busyMsg}
                      onClick={() => handleScriptAiTool("rewrite")}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <Edit3 className="w-4 h-4 text-[var(--cyan)]" />
                      <span>{isAr ? "إعادة صياغة" : "Rewrite"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!!busyMsg}
                      onClick={() => handleScriptAiTool("expand")}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <ArrowUp className="w-4 h-4" />
                      <span>{isAr ? "توسيع وتفصيل" : "Expand"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!!busyMsg}
                      onClick={() => handleScriptAiTool("shorten")}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <ArrowDown className="w-4 h-4" />
                      <span>{isAr ? "اختصار وتكثيف" : "Shorten"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => copyToClipboard(narrative.scriptDraft, "script")}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <Copy className="w-4 h-4" />
                      <span>
                        {copiedId === "script"
                          ? isAr
                            ? "تم النسخ ✓"
                            : "Copied ✓"
                          : isAr
                          ? "نسخ السيناريو"
                          : "Copy"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => goToStage(3)}
                  className="uyns-btn uyns-btn--ghost"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{isAr ? "السابق" : "Back"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleApproveScript}
                  className="uyns-btn uyns-btn--primary"
                >
                  <span>{isAr ? "اعتماد السيناريو والمتابعة ←" : "Approve Script & Continue →"}</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================
              STAGE 5: UPLOAD VOICEOVER AUDIO & AUTO-EXTRACT DURATION
              ================================================================ */}
          {stage === 5 && (
            <div className="uyns-stage-card">
              <h1 className="uyns-stage-title">
                {isAr
                  ? "رفع التعليق الصوتي واستخراج المدة تلقائياً (Audio Upload)"
                  : "Upload Voice-Over & Extract Duration"}
              </h1>
              <p className="text-xs text-[var(--muted)] mt-1">
                {isAr
                  ? "ارفع ملف التعليق الصوتي (MP3 / WAV / M4A) وسيقوم النظام باستخراج مدة التعليق الفعلية تلقائياً لتقسيم المشاهد بناءً عليها."
                  : "Upload your narration audio file (MP3 / WAV / M4A) and the studio will automatically extract the exact duration to time your scenes."}
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5">
                <div className="lg:col-span-6 space-y-4">
                  <div className="uyns-card space-y-4">
                    <h2 className="text-sm font-bold">
                      {isAr ? "رفع ملف التعليق الصوتي *" : "Upload Narration Audio File *"}
                    </h2>

                    <Dropzone
                      accept="audio/*"
                      onFiles={onAudio}
                      icon="♪"
                      title={
                        isAr
                          ? "اسحب وأفلت ملف التعليق الصوتي هنا أو اضغط للاختيار"
                          : "Drag & drop your voice-over audio file here or click to browse"
                      }
                      hint="MP3, WAV, M4A, OGG"
                      filled={!!audioFile}
                      filledLabel={
                        audioFile
                          ? `${audioFile.name} (${formatDurationClock(audioDuration)})`
                          : isAr
                          ? "+ اختر ملف صوتي"
                          : "+ Choose Audio File"
                      }
                    />

                    <div className="pt-2 border-t border-[var(--line-soft)] flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--muted)]">
                        {isAr
                          ? "أو ولّد التعليق الصوتي بالذكاء الاصطناعي من السكريبت:"
                          : "Or synthesize AI voice-over directly from your script:"}
                      </span>
                      <button
                        type="button"
                        disabled={!!busyMsg}
                        onClick={handleGenerateAiVoiceover}
                        className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>
                          {isAr ? "توليد صوت ذكي (AI TTS)" : "Generate AI Voice-Over"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="uyns-preview-card space-y-4">
                    <h2 className="text-sm font-bold">
                      {isAr ? "معاينة الصوت والمدة المستخرجة" : "Audio Preview & Extracted Duration"}
                    </h2>

                    {audioUrl ? (
                      <div className="space-y-3">
                        <audio controls src={audioUrl} className="w-full" />
                        <div className="p-3.5 rounded-xl bg-[rgba(0,245,155,0.08)] border border-[var(--accent)] flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-[var(--text)]">
                              {audioFile?.name || "narration.wav"}
                            </div>
                            <div className="text-[11px] text-[var(--muted)]">
                              {isAr
                                ? "تم استخراج مدة التعليق الصوتي بنجاح ✓"
                                : "Voice-over duration automatically extracted ✓"}
                            </div>
                          </div>
                          <span className="text-xl font-extrabold font-mono text-[var(--accent)]">
                            {formatDurationClock(audioDuration || effectiveAudioSec)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 rounded-xl bg-[var(--panel-2)] border border-dashed border-[var(--line)] text-center space-y-2">
                        <Volume2 className="w-7 h-7 text-[var(--muted)] mx-auto" />
                        <div className="text-xs font-semibold text-[var(--muted)]">
                          {isAr
                            ? "بانتظار رفع ملف التعليق الصوتي لاستخراج مدته الفعلية..."
                            : "Waiting for voice-over audio upload to extract exact duration..."}
                        </div>
                      </div>
                    )}

                    <div className="p-3.5 rounded-xl bg-[var(--panel-2)] border border-[var(--line)] flex items-center justify-between">
                      <span className="text-xs text-[var(--muted)]">
                        {isAr ? "مدة التعليق المعتمدة للمشاهد:" : "Extracted Narration Duration:"}
                      </span>
                      <span className="text-lg font-extrabold font-mono text-[var(--accent)]">
                        {formatDurationClock(effectiveAudioSec)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => goToStage(4)}
                  className="uyns-btn uyns-btn--ghost"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{isAr ? "السابق" : "Back"}</span>
                </button>
                <button
                  type="button"
                  disabled={!!busyMsg}
                  onClick={handleConfirmAudioAndTiming}
                  className="uyns-btn uyns-btn--primary"
                >
                  <span>{isAr ? "تأكيد الصوت وتوليد المشاهد ←" : "Confirm Audio & Build Scenes →"}</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================
              STAGE 6: SCENE BREAKDOWN (DYNAMIC SCRIPT-DRIVEN SCENE DURATIONS)
              ================================================================ */}
          {stage === 6 && (
            <div className="uyns-stage-card">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h1 className="uyns-stage-title">
                    {isAr ? "تقسيم المشاهد حسب السكريبت (Scene Breakdown)" : "Dynamic Scene Breakdown"}
                  </h1>
                  <p className="text-xs text-[var(--muted)]">
                    {(narrative.scenes || []).length} {isAr ? "مشهد بمدد متفاوتة طبيعية حسب السكريبت" : "scenes with natural script-driven durations"} ·{" "}
                    {isAr ? "المدة الإجمالية:" : "Total Duration:"}{" "}
                    <span className="font-mono text-[var(--accent)] font-bold">
                      {formatDurationClock(narrative.actualDurationSec || effectiveAudioSec)}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!!busyMsg}
                    onClick={handleRegenerateScenes}
                    className="uyns-btn uyns-btn--primary uyns-btn--sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {(narrative.scenes || []).length === 0
                        ? isAr
                          ? "توليد المشاهد حسب السكريبت الآن"
                          : "Generate Script-Driven Scenes Now"
                        : isAr
                        ? "إعادة تقسيم المشاهد حسب السكريبت"
                        : "Regenerate Dynamic Scenes"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-9 space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {(narrative.scenes || []).length === 0 ? (
                    <div className="p-10 rounded-2xl bg-[var(--panel-2)] border border-dashed border-[var(--line)] text-center space-y-3">
                      <Film className="w-8 h-8 text-[var(--accent)] mx-auto" />
                      <div className="text-sm font-bold">
                        {isAr
                          ? "لم يتم توليد المشاهد بعد لهذا السيناريو"
                          : "No scenes generated yet for this script"}
                      </div>
                      <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
                        {isAr
                          ? "اضغط على زر توليد المشاهد ليقوم الذكاء الاصطناعي بتقسيم السكريبت إلى مشاهد بمدد مختلفة وطبيعية حسب طول كل جملة ومعناها الدرامي."
                          : "Click below to split your approved script into scenes with dynamic, variable durations matching each sentence and dramatic beat."}
                      </p>
                      <button
                        type="button"
                        disabled={!!busyMsg}
                        onClick={handleRegenerateScenes}
                        className="uyns-btn uyns-btn--primary mx-auto"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>
                          {isAr ? "توليد المشاهد الآن" : "Generate Dynamic Scenes Now"}
                        </span>
                      </button>
                    </div>
                  ) : (
                    (narrative.scenes || []).map((sc, idx) => {
                      const isSel = selectedSceneIdx === idx;
                      return (
                        <div
                          key={sc.id || idx}
                          onClick={() => setSelectedSceneIdx(idx)}
                          className={`uyns-scene-row ${isSel ? "is-selected" : ""}`}
                        >
                          <div className="uyns-scene-row__badge">
                            <span className="font-bold">Scene {sc.sceneNumber}</span>
                            <span className="font-mono text-[11px] text-[var(--accent)]">
                              {formatDurationClock(sc.startTime)} - {formatDurationClock(sc.endTime)}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] font-mono text-[10px] text-[var(--cyan)]">
                              {sc.duration}s
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[var(--text)]">
                              {sc.visualDescription}
                            </p>
                            <p className="text-xs text-[var(--muted)] mt-1 italic line-clamp-2">
                              “{sc.scriptExcerpt}”
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] text-[var(--muted)]">
                              <span>Framing: {sc.cameraFraming}</span>
                              <span>·</span>
                              <span>Tone: {sc.emotionalTone}</span>
                              <span>·</span>
                              <span>Transition: {sc.transitionSuggestion}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Scene Tools Sidebar */}
                <div className="lg:col-span-3">
                  <div className="uyns-card space-y-2.5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                      {isAr ? "أدوات المشهد" : "Scene Tools"}
                    </h2>
                    <button
                      type="button"
                      onClick={() => handleEditScene(selectedSceneIdx)}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <Edit3 className="w-4 h-4 text-[var(--accent)]" />
                      <span>{isAr ? "تعديل المشهد" : "Edit Scene"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMergeWithNext(selectedSceneIdx)}
                      disabled={selectedSceneIdx >= (narrative.scenes?.length || 0) - 1}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <Merge className="w-4 h-4 text-[var(--cyan)]" />
                      <span>{isAr ? "دمج مع التالي" : "Merge Scenes"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSplitScene(selectedSceneIdx)}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <Scissors className="w-4 h-4" />
                      <span>{isAr ? "تقسيم المشهد" : "Split Scene"}</span>
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleMoveScene(selectedSceneIdx, -1)}
                        disabled={selectedSceneIdx <= 0}
                        className="uyns-btn uyns-btn--ghost flex-1 justify-center"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveScene(selectedSceneIdx, 1)}
                        disabled={selectedSceneIdx >= (narrative.scenes?.length || 0) - 1}
                        className="uyns-btn uyns-btn--ghost flex-1 justify-center"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!!busyMsg}
                      onClick={handleRegenerateScenes}
                      className="uyns-btn uyns-btn--ghost w-full justify-start"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>{isAr ? "إعادة تقسيم الكل" : "Regenerate All"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!!busyMsg}
                      onClick={handleConfirmScenes}
                      className="uyns-btn uyns-btn--primary w-full justify-center mt-2"
                    >
                      <span>{isAr ? "تأكيد المشاهد" : "Confirm Scenes"}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => goToStage(5)}
                  className="uyns-btn uyns-btn--ghost"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{isAr ? "السابق" : "Back"}</span>
                </button>
                <button
                  type="button"
                  disabled={!!busyMsg}
                  onClick={handleConfirmScenes}
                  className="uyns-btn uyns-btn--primary"
                >
                  <span>{isAr ? "متابعة إلى برومبتات الصور ←" : "Continue to Image Prompts →"}</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================
              STAGE 7: STANDALONE IMAGE PROMPTS ONLY (GENERATED FROM SCRIPT & CHANNEL)
              ================================================================ */}
          {stage === 7 && (
            <div className="uyns-stage-card">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h1 className="uyns-stage-title">
                    {isAr
                      ? "برومبتات الصور للمشاهد (Image Prompts)"
                      : "Standalone Scene Image Prompts"}
                  </h1>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {isAr
                      ? `مُولدة حسب السكريبت المعتمد وإعدادات قناة "${activeChannel?.name || ""}" (${activeChannel?.aspectRatio || "16:9"})`
                      : `Generated from your approved script and "${activeChannel?.name || "Channel"}" settings (${activeChannel?.aspectRatio || "16:9"})`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!!busyMsg}
                    onClick={handleRegenerateAllPrompts}
                    className="uyns-btn uyns-btn--primary uyns-btn--sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {(narrative.imagePrompts || []).length === 0
                        ? isAr
                          ? "توليد برومبتات الصور حسب السكريبت والقناة"
                          : "Generate Image Prompts from Script & Channel"
                        : isAr
                        ? "إعادة توليد كل برومبتات الصور"
                        : "Regenerate All Image Prompts"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        (narrative.imagePrompts || []).map((p) => p.prompt).join("\n\n"),
                        "all_img_prompts"
                      )
                    }
                    className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>
                      {copiedId === "all_img_prompts"
                        ? "Copied All ✓"
                        : isAr
                        ? "نسخ كل برومبتات الصور"
                        : "Copy All Image Prompts"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPromptsTxt}
                    className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isAr ? "تصدير TXT" : "Export TXT"}</span>
                  </button>
                </div>
              </div>

              {(narrative.imagePrompts || []).length === 0 ? (
                <div className="p-10 rounded-2xl bg-[var(--panel-2)] border border-dashed border-[var(--line)] text-center space-y-3">
                  <Sparkles className="w-8 h-8 text-[var(--accent)] mx-auto" />
                  <div className="text-sm font-bold">
                    {isAr
                      ? "لم يتم توليد برومبتات الصور بعد"
                      : "No Image Prompts generated yet"}
                  </div>
                  <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
                    {isAr
                      ? "اضغط على الزر أدناه لتوليد برومبتات صور مستقلة لكل مشهد بناءً على السكريبت وإعدادات القناة المختارة."
                      : "Click below to generate standalone image prompts for every scene based on your script and selected channel settings."}
                  </p>
                  <button
                    type="button"
                    disabled={!!busyMsg}
                    onClick={handleRegenerateAllPrompts}
                    className="uyns-btn uyns-btn--primary mx-auto"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {isAr
                        ? "توليد برومبتات الصور الآن"
                        : "Generate Image Prompts Now"}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Scene List */}
                  <div className="lg:col-span-4 space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {(narrative.scenes || []).map((sc, idx) => (
                      <button
                        key={sc.id || idx}
                        type="button"
                        onClick={() => setSelectedSceneIdx(idx)}
                        className={`uyns-scene-mini ${selectedSceneIdx === idx ? "is-active" : ""}`}
                      >
                        <div className="text-left">
                          <div className="text-xs font-bold">
                            Scene {sc.sceneNumber} ({sc.duration}s)
                          </div>
                          <div className="text-[11px] font-mono text-[var(--muted)]">
                            {formatDurationClock(sc.startTime)} - {formatDurationClock(sc.endTime)}
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                      </button>
                    ))}
                  </div>

                  {/* Right Active Scene Image Prompt Only */}
                  <div className="lg:col-span-8 space-y-4">
                    {activeScene && (
                      <div className="uyns-card space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold">
                              Image Prompt — Scene {activeScene.sceneNumber} ({activeScene.duration}s)
                            </h3>
                            <p className="text-xs text-[var(--muted)] italic mt-0.5">
                              “{activeScene.scriptExcerpt}”
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!!busyMsg}
                              onClick={() => handleRegenerateSinglePrompt(activeScene)}
                              className="uyns-btn uyns-btn--sm"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>{isAr ? "إعادة توليد البرومبت" : "Regenerate Prompt"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(activeImagePrompt?.prompt || "", "cur_ip")
                              }
                              className="uyns-btn uyns-btn--primary uyns-btn--sm"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>
                                {copiedId === "cur_ip"
                                  ? "Copied ✓"
                                  : isAr
                                  ? "نسخ البرومبت"
                                  : "Copy Prompt"}
                              </span>
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={8}
                          value={activeImagePrompt?.prompt || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateNarrative((prev) => ({
                              ...prev,
                              imagePrompts: prev.imagePrompts.map((p) =>
                                p.sceneId === activeScene.id ? { ...p, prompt: val } : p
                              ),
                            }));
                          }}
                          className="w-full rounded-xl bg-[var(--panel-2)] border border-[var(--line)] p-3.5 text-xs font-mono leading-relaxed"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => goToStage(6)}
                  className="uyns-btn uyns-btn--ghost"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{isAr ? "السابق" : "Back"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPromptsToAssets}
                  className="uyns-btn uyns-btn--primary"
                >
                  <span>{isAr ? "متابعة إلى رفع الملفات ←" : "Continue to Assets →"}</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================
              STAGE 8: ASSET UPLOAD & PRODUCTION PREPARATION
              ================================================================ */}
          {stage === 8 && (
            <div className="uyns-stage-card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h1 className="uyns-stage-title">
                    {isAr ? "رفع ملفات الإنتاج (Assets & Preparation)" : "Assets Upload & Preparation"}
                  </h1>
                  <p className="text-xs text-[var(--muted)]">
                    {isAr
                      ? "ارفع صور المشاهد وملف التعليق الصوتي والترجمة قبل فتح محرر الفيديو."
                      : "Upload scene images, narration audio, and SRT/VTT captions before launching the Video Editor."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <Dropzone
                    compact
                    multiple
                    accept="image/*,video/*"
                    onFiles={handleBulkSceneAssetsUpload}
                    icon="▦"
                    title={isAr ? "رفع دفعة صور المشاهد" : "Bulk Upload Scene Images"}
                    filled={false}
                    filledLabel={isAr ? "+ رفع عدة صور" : "+ Bulk Upload"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Scene Assets List */}
                <div className="lg:col-span-7 space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                  {(() => {
                    const validSlots = (slots || []).filter((s) => !s.empty && s.img);
                    return (narrative.scenes || []).map((sc, sceneIdx) => {
                      const expectedSec = Math.floor(sc.startTime || 0);
                      const matchedSlot =
                        validSlots.find(
                          (s) =>
                            s.seconds != null &&
                            (Math.abs(s.seconds - expectedSec) < 0.9 ||
                              Math.abs(s.seconds - sc.startTime) < 0.9)
                        ) || validSlots[sceneIdx];
                      return (
                        <div key={sc.id} className="uyns-asset-row">
                          <div className="uyns-asset-row__thumb">
                            {matchedSlot?.img?.url ? (
                              <img src={matchedSlot.img.url} alt="" />
                            ) : (
                              <span className="text-[10px] text-[var(--muted)]">Missing</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold">
                              Scene {sc.sceneNumber} ({sc.duration}s) ·{" "}
                              <span className="font-mono text-[var(--muted)]">
                                {formatFilenameTimestamp(sc.startTime)}.png
                              </span>
                            </div>
                            <div className="text-[11px] text-[var(--muted)] truncate">
                              {matchedSlot?.file?.originalName ||
                                matchedSlot?.file?.name ||
                                sc.visualDescription}
                            </div>
                          </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] font-semibold ${
                              matchedSlot ? "text-[var(--accent)]" : "text-amber-400"
                            }`}
                          >
                            {matchedSlot
                              ? isAr
                                ? "تم الرفع ✓"
                                : "Uploaded"
                              : isAr
                              ? "بانتظار الصورة"
                              : "Missing"}
                          </span>
                          <button
                            type="button"
                            disabled={!!busyMsg}
                            onClick={() => handleGenerateSceneAiImage(sc)}
                            className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                            title={
                              isAr
                                ? "توليد صورة المشهد بالذكاء الاصطناعي"
                                : "Generate scene image with AI"
                            }
                          >
                            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                            <span>{isAr ? "توليد AI" : "AI Image"}</span>
                          </button>
                          <label className="uyns-btn uyns-btn--sm cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{matchedSlot ? (isAr ? "استبدال" : "Replace") : isAr ? "رفع" : "Upload"}</span>
                            <input
                              type="file"
                              accept="image/*,video/*"
                              hidden
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleSceneAssetUpload(sc, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      );
                    });
                  })()}
                </div>

                {/* Right: Audio & Captions */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="uyns-card space-y-3">
                    <h2 className="text-sm font-bold">
                      {isAr ? "الصوت والترجمة (Audio & Captions)" : "Audio & Captions"}
                    </h2>

                    <div className="p-3 rounded-xl bg-[var(--panel-2)] border border-[var(--line)] flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold">Narration Audio</div>
                        <div className="text-[11px] text-[var(--muted)] font-mono">
                          {audioFile
                            ? `${audioFile.name} (${formatDurationClock(audioDuration)})`
                            : "No audio file uploaded yet"}
                        </div>
                      </div>
                      <Dropzone
                        compact
                        accept="audio/*"
                        onFiles={onAudio}
                        icon="♪"
                        title="Audio"
                        filled={!!audioFile}
                        filledLabel={audioFile ? "Uploaded ✓" : "+ Upload"}
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-[var(--panel-2)] border border-[var(--line)] space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold">Captions (SRT / VTT)</div>
                          <div className="text-[11px] text-[var(--muted)]">
                            {captionName
                              ? `${captionName} (${captionCues?.length || 0} cues)`
                              : "Optional subtitle file"}
                          </div>
                        </div>
                        <Dropzone
                          compact
                          accept=".srt,.vtt,.txt,text/plain"
                          onFiles={(files) => files?.[0] && onCaptionFile(files[0])}
                          icon="💬"
                          title="Captions"
                          filled={!!captionRaw}
                          filledLabel={captionRaw ? "Uploaded ✓" : "+ Upload"}
                        />
                      </div>
                      {captionError && (
                        <div className="text-xs text-[var(--bad)]">{captionError}</div>
                      )}
                      {captionRaw && (
                        <textarea
                          rows={4}
                          value={captionRaw}
                          onChange={(e) => onUpdateCaptionRaw && onUpdateCaptionRaw(e.target.value)}
                          className="w-full rounded-lg bg-[var(--bg)] border border-[var(--line)] p-2 text-xs font-mono"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => goToStage(7)}
                  className="uyns-btn uyns-btn--ghost"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{isAr ? "السابق" : "Back"}</span>
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => goToStage(10)}
                    className="uyns-btn uyns-btn--ghost"
                  >
                    <span>{isAr ? "ملخص المشروع والسيو" : "Project Overview & SEO"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueFromAssetsToEditor}
                    className="uyns-btn uyns-btn--primary"
                  >
                    <Film className="w-4 h-4" />
                    <span>{isAr ? "فتح في محرر الفيديو ←" : "Open in Video Editor →"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              STAGE 9: EMBEDDED VIDEO EDITOR (UNIFIED LAYOUT)
              ================================================================ */}
          {stage === 9 && (
            <div className="uyns-stage-card !p-3 sm:!p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--line)]">
                <div className="flex items-center gap-2.5">
                  <Film className="w-4 h-4 text-[var(--accent)]" />
                  <h2 className="text-sm font-extrabold">
                    {isAr
                      ? "محرر الفيديو والتايم لاين (Video Editor)"
                      : "Video Timeline Editor & MP4 Export"}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToStage(8)}
                    className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{isAr ? "ملفات الإنتاج" : "Assets"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => goToStage(10)}
                    className="uyns-btn uyns-btn--primary uyns-btn--sm"
                  >
                    <span>{isAr ? "السيو وملخص المشروع ←" : "SEO & Overview →"}</span>
                  </button>
                </div>
              </div>

              <div className="w-full h-[calc(100vh-230px)] min-h-[580px] flex flex-col overflow-hidden rounded-xl">
                {editorNode}
              </div>
            </div>
          )}

          {/* ================================================================
              STAGE 10: SEO & OVERVIEW HUB (YOUTUBE METADATA & 3 THUMBNAIL PROMPTS)
              ================================================================ */}
          {stage === 10 && (
            <div className="uyns-stage-card space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--line)]">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-extrabold">
                      {isAr ? "السيو وملخص المشروع (SEO & Overview)" : "YouTube SEO & Project Overview"}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[rgba(0,245,155,0.12)] text-[var(--accent)] border border-[var(--line-glow)]">
                      {activeChannel?.name || "Channel"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {isAr
                      ? "توليد عناوين الفيديو والوصف والفصول والكلمات المفتاحية حسب سياسة اليوتيوب + 3 اقتراحات لبرومبتات الصورة المصغرة حسب ستايل القناة المختارة."
                      : "Generate YouTube-policy-compliant Titles, Description, Chapters, Tags & 3 Thumbnail Prompts tailored to your selected Channel."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={!!busyMsg}
                    onClick={handleGenerateStage10Seo}
                    className="uyns-btn uyns-btn--primary"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {busyMsg
                        ? isAr
                          ? "جاري التوليد..."
                          : "Generating SEO & Thumbnails..."
                        : isAr
                        ? "توليد السيو و 3 برومبتات للصورة المصغرة (AI)"
                        : "Generate YouTube SEO & 3 Thumbnail Prompts"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueFromAssetsToEditor}
                    className="uyns-btn uyns-btn--ghost"
                  >
                    <Film className="w-4 h-4" />
                    <span>{isAr ? "محرر الفيديو" : "Video Editor"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPromptsTxt}
                    className="uyns-btn uyns-btn--ghost"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isAr ? "تصدير البرومبتات" : "Export Prompts"}</span>
                  </button>
                </div>
              </div>

              {/* Quick Project Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="uyns-card">
                  <span className="text-xs text-[var(--muted)]">{isAr ? "القناة المختارة" : "Active Channel"}</span>
                  <div className="text-sm font-bold mt-1 truncate">
                    {activeChannel?.name || "Default Channel"}
                  </div>
                </div>
                <div className="uyns-card">
                  <span className="text-xs text-[var(--muted)]">{isAr ? "عدد المشاهد" : "Total Scenes"}</span>
                  <div className="text-sm font-bold mt-1 font-mono">
                    {(narrative.scenes || []).length} scenes
                  </div>
                </div>
                <div className="uyns-card">
                  <span className="text-xs text-[var(--muted)]">{isAr ? "مدة التعليق الفعلية" : "Audio Duration"}</span>
                  <div className="text-sm font-bold mt-1 font-mono text-[var(--accent)]">
                    {formatDurationClock(narrative.actualDurationSec || effectiveAudioSec)}
                  </div>
                </div>
                <div className="uyns-card">
                  <span className="text-xs text-[var(--muted)]">{isAr ? "النيتش والمقاس" : "Niche & Aspect"}</span>
                  <div className="text-sm font-bold mt-1 truncate">
                    {activeChannel?.niche || narrative.selectedConcept?.niche || "Documentary"} ({activeChannel?.aspectRatio || "16:9"})
                  </div>
                </div>
              </div>

              {!narrative.seoPackage?.titles?.length ? (
                <div className="p-10 rounded-2xl bg-[var(--panel-2)] border border-dashed border-[var(--line)] text-center space-y-3">
                  <Sparkles className="w-8 h-8 text-[var(--accent)] mx-auto" />
                  <h3 className="text-sm font-extrabold">
                    {isAr
                      ? "اضغط على زر التوليد لإنشاء حزمة السيو الكاملة و 3 برومبتات للصورة المصغرة"
                      : "Generate YouTube SEO Package & 3 Channel-Styled Thumbnail Prompts"}
                  </h3>
                  <p className="text-xs text-[var(--muted)] max-w-lg mx-auto">
                    {isAr
                      ? "سيقوم النظام بتوليد 5 عناوين جذابة متوافقة مع سياسة اليوتيوب، وصف كامل مع الفصول الزمنية، الكلمات المفتاحية، و 3 اقتراحات لبرومبت الصورة المصغرة متوافقة مع ستايل القناة المختارة."
                      : "Creates 5 YouTube-compliant high-CTR titles, full SEO description with real scene chapters, tags (<500 chars), and 3 standalone thumbnail image prompts matching your channel's style."}
                  </p>
                  <button
                    type="button"
                    disabled={!!busyMsg}
                    onClick={handleGenerateStage10Seo}
                    className="uyns-btn uyns-btn--primary mx-auto"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {isAr
                        ? "توليد السيو و 3 برومبتات للصورة المصغرة الآن"
                        : "Generate SEO & 3 Thumbnail Prompts Now"}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 3 Thumbnail Prompts Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-extrabold text-[var(--accent)]">
                        {isAr
                          ? "3 اقتراحات لبرومبتات الصورة المصغرة (حسب إعدادات وستايل القناة المختارة)"
                          : "3 Channel-Styled Thumbnail Prompt Suggestions"}
                      </h2>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            (narrative.seoPackage.thumbnails || [])
                              .map(
                                (t, i) =>
                                  `Thumbnail ${i + 1} (${t.conceptTitle}) [Text: ${t.suggestedText}]:\n${t.visualPrompt}`
                              )
                              .join("\n\n"),
                            "all_thumbs"
                          )
                        }
                        className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>
                          {copiedId === "all_thumbs"
                            ? "Copied All ✓"
                            : isAr
                            ? "نسخ الـ 3 برومبتات"
                            : "Copy All 3 Prompts"}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(narrative.seoPackage.thumbnails || []).slice(0, 3).map((th, idx) => (
                        <div key={th.id || idx} className="uyns-card space-y-3 border border-[var(--line)]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-[rgba(0,245,155,0.12)] text-[var(--accent)] text-xs font-extrabold">
                              {isAr ? `اقتراح ${idx + 1}:` : `Option ${idx + 1}:`} {th.conceptTitle}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(th.visualPrompt, `thumb_p_${idx}`)}
                              className="uyns-btn uyns-btn--primary uyns-btn--sm"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>
                                {copiedId === `thumb_p_${idx}`
                                  ? "Copied ✓"
                                  : isAr
                                  ? "نسخ البرومبت"
                                  : "Copy Prompt"}
                              </span>
                            </button>
                          </div>

                          <div className="p-2.5 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-[var(--muted)] block">
                                {isAr ? "النص المقترح على الصورة:" : "Suggested Overlay Text:"}
                              </span>
                              <strong className="text-xs font-extrabold text-[var(--cyan)]">
                                “{th.suggestedText}”
                              </strong>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(th.suggestedText, `thumb_txt_${idx}`)}
                              className="text-[11px] text-[var(--accent)] hover:underline"
                            >
                              {copiedId === `thumb_txt_${idx}` ? "✓" : isAr ? "نسخ النص" : "Copy Text"}
                            </button>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--muted)] block mb-1">
                              {isAr ? "برومبت الصورة المصغرة (Image Prompt):" : "Thumbnail Image Prompt:"}
                            </label>
                            <textarea
                              rows={5}
                              value={th.visualPrompt || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateNarrative((prev) => {
                                  const nextThumbs = [...(prev.seoPackage?.thumbnails || [])];
                                  nextThumbs[idx] = { ...th, visualPrompt: val };
                                  return {
                                    ...prev,
                                    seoPackage: { ...prev.seoPackage, thumbnails: nextThumbs },
                                  };
                                });
                              }}
                              className="w-full rounded-xl bg-[var(--panel-2)] border border-[var(--line)] p-2.5 text-xs font-mono leading-relaxed"
                            />
                          </div>

                          {th.compositionNotes && (
                            <p className="text-[11px] text-[var(--muted)]">
                              <strong>{isAr ? "ملاحظات التكوين:" : "Composition:"}</strong> {th.compositionNotes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Titles & Description & Tags Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* 5 YouTube Titles + Tags */}
                    <div className="lg:col-span-6 space-y-4">
                      <div className="uyns-card space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold">
                              {isAr
                                ? "عناوين الفيديو المقترحة — اختر العنوان النهائي للمشروع"
                                : "YouTube Title Suggestions — Select Final Project Title"}
                            </h3>
                            <p className="text-[11px] text-[var(--muted)] mt-0.5">
                              {isAr
                                ? "عند اختيار أي عنوان كعنوان نهائي، يتغير اسم المشروع تلقائياً إلى هذا العنوان."
                                : "Selecting a final title automatically updates your project name."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                (narrative.seoPackage.titles || []).join("\n"),
                                "seo_titles_all"
                              )
                            }
                            className="uyns-btn uyns-btn--sm"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{copiedId === "seo_titles_all" ? "Copied ✓" : "Copy All"}</span>
                          </button>
                        </div>

                        {(narrative.seoPackage.titles || []).map((t, idx) => {
                          const isSelectedTitle =
                            (narrative.seoPackage?.selectedTitle || currentProject?.name || "") === t &&
                            Boolean(t && t.trim());
                          const handlePickFinalTitle = () => {
                            if (!t || !t.trim()) return;
                            const cleanTitle = t.trim();
                            updateNarrative((prev) => ({
                              ...prev,
                              seoPackage: {
                                ...prev.seoPackage,
                                selectedTitle: cleanTitle,
                              },
                            }));
                            if (onRenameProject) {
                              onRenameProject(cleanTitle, true);
                            }
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
                                onClick={handlePickFinalTitle}
                                className={`uyns-seo-title-num cursor-pointer transition-colors ${
                                  isSelectedTitle
                                    ? "!bg-[var(--accent)] !text-[var(--accent-ink)]"
                                    : ""
                                }`}
                                title={
                                  isAr
                                    ? "اعتماد كعنوان نهائي للمشروع"
                                    : "Set as Final Project Title"
                                }
                              >
                                {isSelectedTitle ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                              </button>
                              <input
                                type="text"
                                value={t}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateNarrative((prev) => {
                                    const next = [...(prev.seoPackage?.titles || [])];
                                    next[idx] = val;
                                    const wasSelected = prev.seoPackage?.selectedTitle === t;
                                    return {
                                      ...prev,
                                      seoPackage: {
                                        ...prev.seoPackage,
                                        titles: next,
                                        ...(wasSelected ? { selectedTitle: val } : {}),
                                      },
                                    };
                                  });
                                  if (isSelectedTitle && onRenameProject && val.trim()) {
                                    onRenameProject(val.trim(), true);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={handlePickFinalTitle}
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
                                onClick={() => copyToClipboard(t, `seo_t_${idx}`)}
                                className="uyns-btn uyns-btn--sm uyns-btn--ghost"
                                title={isAr ? "نسخ العنوان" : "Copy title"}
                              >
                                {copiedId === `seo_t_${idx}` ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="uyns-card space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold">
                            {isAr ? "الكلمات المفتاحية والهاشتاجات (Tags)" : "YouTube Tags & Hashtags"}
                          </h3>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                (narrative.seoPackage.tags || []).join(", "),
                                "seo_tags_csv"
                              )
                            }
                            className="uyns-btn uyns-btn--sm"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{copiedId === "seo_tags_csv" ? "Copied ✓" : "Copy Tags"}</span>
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={(narrative.seoPackage.tags || []).join(", ")}
                          onChange={(e) => {
                            const arr = e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            updateNarrative((prev) => ({
                              ...prev,
                              seoPackage: { ...prev.seoPackage, tags: arr },
                            }));
                          }}
                          className="w-full rounded-xl bg-[var(--panel-2)] border border-[var(--line)] p-2.5 text-xs font-mono"
                        />
                        <div className="text-xs text-[var(--accent)] font-mono">
                          {(narrative.seoPackage.hashtags || []).join(" ")}
                        </div>
                      </div>
                    </div>

                    {/* Full Description & Chapters */}
                    <div className="lg:col-span-6 space-y-4">
                      <div className="uyns-card space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold">
                            {isAr ? "وصف الفيديو والفصول الزمنية" : "YouTube Description & Chapters"}
                          </h3>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(narrative.seoPackage.description || "", "seo_desc")
                            }
                            className="uyns-btn uyns-btn--sm"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{copiedId === "seo_desc" ? "Copied ✓" : "Copy Description"}</span>
                          </button>
                        </div>
                        <textarea
                          rows={11}
                          value={narrative.seoPackage.description || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateNarrative((prev) => ({
                              ...prev,
                              seoPackage: { ...prev.seoPackage, description: val },
                            }));
                          }}
                          className="w-full rounded-xl bg-[var(--panel-2)] border border-[var(--line)] p-3 text-xs leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
