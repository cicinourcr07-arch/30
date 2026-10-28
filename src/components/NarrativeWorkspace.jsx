"use client";
import { useState, useMemo, useEffect } from "react";
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
  getStoredGeminiKeys,
} from "../lib/aiService";
import { compressImageFile } from "../lib/imageUtils";
import { showAlert, showConfirm, showPrompt } from "./Dialog";
import Dropzone from "./Dropzone";
import ChannelsView from "./ChannelsView";
import {
  Play,
  Home,
  Clock,
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
  KeyRound,
  Lightbulb,
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
  const [failoverNotice, setFailoverNotice] = useState(null);

  useEffect(() => {
    let timer = null;
    const handleKeySwitched = (e) => {
      const { usedKeyIndex, totalKeys, usedKeyMasked } = e.detail || {};
      setFailoverNotice({
        type: "key",
        message: isAr
          ? `🔄 تم تدوير المفتاح تلقائياً: تم استهلاك حصة المفتاح السابق والانتقال فوراً للمفتاح #${usedKeyIndex} من أصل ${totalKeys} (${usedKeyMasked}) بنجاح دون مقاطعة.`
          : `🔄 Automatic Key Failover: Rate limit reached on previous key, seamlessly rotated to Key #${usedKeyIndex}/${totalKeys} (${usedKeyMasked}).`,
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setFailoverNotice(null), 9000);
    };

    const handleModelSwitched = (e) => {
      const { usedModel } = e.detail || {};
      setFailoverNotice({
        type: "model",
        message: isAr
          ? `⚡ تم تبديل الموديل تلقائياً: نفدت حصة الموديل الحالي، تم التحويل فوراً إلى '${usedModel}' لمواصلة المعالجة بنجاح.`
          : `⚡ Automatic Model Cascade: Quota exhausted, seamlessly cascaded to '${usedModel}' to continue processing.`,
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setFailoverNotice(null), 9000);
    };

    window.addEventListener("gemini-key-switched", handleKeySwitched);
    window.addEventListener("gemini-model-switched", handleModelSwitched);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("gemini-key-switched", handleKeySwitched);
      window.removeEventListener("gemini-model-switched", handleModelSwitched);
    };
  }, [isAr]);

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

  const [scenePaceSec, setScenePaceSec] = useState(10);

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
    const topicInput = (ref.topicName || ref.title || "").trim();
    const urlInput = (ref.youtubeUrl || "").trim();
    const mode = topicInput ? "topic" : (urlInput ? "youtube" : (ref.mode || "topic"));

    if (mode === "youtube") {
      if (!ref.youtubeUrl?.trim() && !ref.title?.trim() && !ref.pastedTranscript?.trim()) {
        setStageError(
          isAr
            ? "يرجى إدخال رابط فيديو يوتيوب صحيح للبدء في التحليل."
            : "Please enter a valid YouTube URL to begin analysis."
        );
        return;
      }
    } else {
      const topic = (ref.topicName || ref.title || "").trim();
      if (!topic) {
        setStageError(
          isAr
            ? "يرجى كتابة اسم الموضوع أو فكرة الفيديو للبدء (الوصف اختياري)."
            : "Please enter the topic name or video subject to proceed (description is optional)."
        );
        return;
      }
    }

    setBusyMsg(
      isAr
        ? mode === "topic"
          ? "جاري تحليل فكرة الموضوع وبناء الستايل البصري وتوليد 5 أفكار متميزة..."
          : "جاري تحليل المرجع والصورة المصغرة وتوليد 5 أفكار أصلية..."
        : mode === "topic"
        ? "Analyzing topic, crafting visual style lock, and generating 5 original concepts..."
        : "Analyzing reference & thumbnail vision and generating 5 original concepts..."
    );
    setStageError(null);
    try {
      let meta = {};
      if (mode === "youtube" && ref.youtubeUrl?.trim() && !ref.thumbnailBase64) {
        try {
          meta = await fetchYouTubeMetadata(ref.youtubeUrl.trim());
        } catch (metaErr) {
          // If URL is invalid, stop and show error
          throw metaErr;
        }
      }

      const effectiveTitle =
        mode === "topic"
          ? (ref.topicName || ref.title || "").trim()
          : (ref.title || meta.title || "");

      const effectiveDescription =
        mode === "topic"
          ? (ref.topicDescription !== undefined ? ref.topicDescription : (ref.description || "")).trim()
          : (meta.description || ref.description || "");

      const mergedRef = {
        ...ref,
        mode,
        title: effectiveTitle,
        topicName: effectiveTitle,
        description: effectiveDescription,
        topicDescription: effectiveDescription,
        author: mode === "topic" ? (activeChannel?.name || "Original Topic") : (meta.author || ref.author || ""),
        duration: meta.duration || ref.duration || "",
        views: meta.views || ref.views || "",
        thumbnailUrl: ref.thumbnailUrl || meta.thumbnailUrl || "",
        thumbnailBase64: ref.thumbnailBase64 || meta.thumbnailBase64 || null,
        thumbnailMime: ref.thumbnailMime || meta.thumbnailMime || "image/jpeg",
        notice: meta.notice || ref.notice || "",
      };

      // Auto-update project name if default
      if (
        effectiveTitle &&
        (!currentProject?.name ||
          currentProject.name === "My Awesome Project" ||
          currentProject.name === "مشروع جديد")
      ) {
        onRenameProject(effectiveTitle, true);
      }

      const aiRes = await analyzeReferenceAndConcepts({
        projectName: currentProject?.name || effectiveTitle || "My Awesome Project",
        referenceMode: mode,
        youtubeUrl: mode === "youtube" ? mergedRef.youtubeUrl : "",
        referenceTitle: effectiveTitle,
        topicName: effectiveTitle,
        description: effectiveDescription,
        topicDescription: effectiveDescription,
        channelName: mergedRef.author,
        pastedTranscript: mergedRef.pastedTranscript,
        nichePreference: mergedRef.nichePreference || activeChannel?.niche,
        channelNiche: activeChannel?.niche,
        languagePreference: mergedRef.languagePreference,
        thumbnailBase64: mergedRef.thumbnailBase64,
        thumbnailMime: mergedRef.thumbnailMime,
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });

      const allConcepts = Array.isArray(aiRes.concepts) ? aiRes.concepts : [];
      const userOriginalConcept =
        aiRes.userConcept ||
        allConcepts.find((c) => c.isUserOriginal || c.id === "user-original-concept") ||
        allConcepts[0] ||
        null;

      updateNarrative((prev) => ({
        ...prev,
        reference: { ...mergedRef, analyzedAt: Date.now() },
        analysis: aiRes.analysis,
        visualStyleLock: {
          ...(aiRes.visualStyleLock || prev.visualStyleLock),
          approved: true,
        },
        userConcept: userOriginalConcept,
        concepts: allConcepts,
        selectedConceptId: userOriginalConcept?.id || allConcepts[0]?.id || null,
        selectedConcept: userOriginalConcept || allConcepts[0] || null,
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

  const handleEditConcept = async (concept, idx) => {
    const newTitle = await showPrompt(
      isAr ? "تعديل عنوان الفكرة:" : "Edit Concept Title:",
      {
        title: isAr ? "تعديل الفكرة" : "Edit Concept",
        defaultValue: concept.title || "",
        okText: isAr ? "حفظ" : "Save",
      }
    );
    if (newTitle == null || !newTitle.trim()) return;
    const newPremise = await showPrompt(
      isAr ? "تعديل ملخص وسرد الفكرة (Premise):" : "Edit Concept Premise / Story:",
      {
        title: isAr ? "تعديل ملخص الفكرة" : "Edit Concept Premise",
        defaultValue: concept.premise || "",
        okText: isAr ? "حفظ" : "Save",
      }
    );
    const updatedConcept = {
      ...concept,
      title: newTitle.trim(),
      premise: newPremise != null && newPremise.trim() ? newPremise.trim() : concept.premise,
    };
    updateNarrative((prev) => {
      const nextConcepts = [...(prev.concepts || [])];
      nextConcepts[idx] = updatedConcept;
      const isCurSelected = prev.selectedConceptId === concept.id;
      return {
        ...prev,
        concepts: nextConcepts,
        userConcept:
          concept.isUserOriginal || concept.id === "user-original-concept"
            ? updatedConcept
            : prev.userConcept,
        selectedConcept: isCurSelected ? updatedConcept : prev.selectedConcept,
      };
    });
  };

  const handleRegenerateConcepts = async () => {
    setBusyMsg(isAr ? "جاري توليد 5 مقترحات بديلة جديدة..." : "Generating 5 fresh alternative proposals...");
    setStageError(null);
    try {
      const res = await regenerateConcepts(narrative.analysis, "", textProvider, codecraftCfg);
      if (Array.isArray(res.concepts) && res.concepts.length) {
        updateNarrative((prev) => {
          const original =
            prev.userConcept ||
            prev.concepts?.find((c) => c.isUserOriginal || c.id === "user-original-concept") ||
            null;
          const fresh5 = res.concepts.slice(0, 5).map((c, i) => ({
            ...c,
            id: c.id || `alt-concept-${Date.now()}-${i + 1}`,
            isUserOriginal: false,
          }));
          const combined = original ? [original, ...fresh5] : fresh5;
          const stillHasSelected = combined.some((c) => c.id === prev.selectedConceptId);
          const newSelected = stillHasSelected
            ? combined.find((c) => c.id === prev.selectedConceptId)
            : combined[0];
          return {
            ...prev,
            concepts: combined,
            userConcept: original || prev.userConcept,
            selectedConceptId: newSelected?.id || combined[0]?.id || null,
            selectedConcept: newSelected || combined[0] || null,
          };
        });
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
    // 1. Explicit manual duration override typed by user (e.g. 10:25) takes highest priority
    const manualSec = parseDurationInput(narrative.manualDurationInput);
    if (manualSec > 0) return Math.round(manualSec * 10) / 10;

    // 2. Uploaded audio file physical duration takes next priority
    if (audioDuration > 0) return Math.round(audioDuration * 10) / 10;

    // 3. Persisted project actualDurationSec
    if (narrative.actualDurationSec > 0) return Math.round(narrative.actualDurationSec * 10) / 10;

    // 4. Fallback to script estimate or targetDurationMinutes
    return scriptEstSec || (narrative.config?.targetDurationMinutes || 10) * 60;
  }, [
    narrative.manualDurationInput,
    audioDuration,
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
          ? "يرجى رفع ملف صوتي أو إدخال مدة الصوت الفعلية (مثال 10:25)."
          : "Please upload narration audio, generate TTS, or enter the actual duration (e.g., 10:25)."
      );
      return;
    }

    let updatedScenes = narrative.scenes || [];
    const scenesEnd =
      updatedScenes.length > 0 ? Number(updatedScenes[updatedScenes.length - 1]?.endTime || 0) : 0;
    const durationMismatch =
      updatedScenes.length > 0 && Math.abs(scenesEnd - effectiveAudioSec) > 0.5;

    if (durationMismatch) {
      // Automatically re-time all existing scenes to match the uploaded/specified audio duration exactly
      updatedScenes = recalculateSceneTimings(updatedScenes, effectiveAudioSec);
    }

    // If no scenes exist yet, generate scene breakdown automatically
    if (!updatedScenes.length) {
      setBusyMsg(
        isAr
          ? `جاري تقسيم السيناريو إلى مشاهد متسلسلة تطابق مدة ${formatDurationClock(effectiveAudioSec)}...`
          : `Splitting approved script into timed visual scenes matching ${formatDurationClock(effectiveAudioSec)}...`
      );
      setStageError(null);
      try {
        const effectiveScriptText = (
          narrative.approvedScript ||
          narrative.scriptDraft ||
          narrative.selectedConcept?.premise ||
          narrative.selectedConcept?.title ||
          narrative.reference?.topicName ||
          narrative.reference?.title ||
          ""
        );
        const res = await generateSceneBreakdown({
          script: effectiveScriptText,
          actualDurationSec: effectiveAudioSec,
          concept: narrative.selectedConcept || narrative.concepts?.[0],
          topicName: narrative.reference?.topicName || narrative.reference?.title,
          topicDescription: narrative.reference?.topicDescription || narrative.reference?.description,
          visualStylePreset: activeVisualPreset,
          channelProfile: activeChannel,
          targetSecondsPerScene: scenePaceSec,
          provider: textProvider,
          codecraftConfig: codecraftCfg,
        });
        updatedScenes = Array.isArray(res?.scenes) && res.scenes.length > 0 ? res.scenes : [];
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
      outdated: { ...prev.outdated, audio: false, scenes: false, imagePrompts: true },
      currentStage: 6,
      maxUnlockedStage: Math.max(prev.maxUnlockedStage || 5, 6),
    }));
  };

  // --- Stage 6: Scene Breakdown & Scene Tools ---
  const handleAutoSyncSceneTimings = () => {
    if (!narrative.scenes?.length || !(effectiveAudioSec > 0)) return;
    const retimed = recalculateSceneTimings(narrative.scenes, effectiveAudioSec);
    updateNarrative((prev) => ({
      ...prev,
      actualDurationSec: effectiveAudioSec,
      scenes: retimed,
      outdated: { ...prev.outdated, scenes: false, imagePrompts: true, motionPrompts: true },
    }));
  };

  const handleRegenerateScenes = async (paceOverride) => {
    const pace = Number(paceOverride) || scenePaceSec || 10;
    if (paceOverride) {
      setScenePaceSec(pace);
    }
    const targetDuration = effectiveAudioSec || narrative.actualDurationSec || 600;
    setBusyMsg(
      isAr
        ? `جاري تقسيم السيناريو إلى مشاهد متوازنة تطابق مدة ${formatDurationClock(targetDuration)} (مشهد كل ~${pace} ثوانٍ)...`
        : `Generating scene breakdown strictly matching ${formatDurationClock(targetDuration)} (~1 scene every ${pace}s)...`
    );
    setStageError(null);
    try {
      const effectiveScriptText = (
        narrative.approvedScript ||
        narrative.scriptDraft ||
        narrative.selectedConcept?.premise ||
        narrative.selectedConcept?.title ||
        narrative.reference?.topicName ||
        narrative.reference?.title ||
        ""
      );
      const res = await generateSceneBreakdown({
        script: effectiveScriptText,
        actualDurationSec: targetDuration,
        concept: narrative.selectedConcept || narrative.concepts?.[0],
        topicName: narrative.reference?.topicName || narrative.reference?.title,
        topicDescription: narrative.reference?.topicDescription || narrative.reference?.description,
        visualStylePreset: activeVisualPreset,
        channelProfile: activeChannel,
        targetSecondsPerScene: pace,
        provider: textProvider,
        codecraftConfig: codecraftCfg,
      });
      if (Array.isArray(res?.scenes) && res.scenes.length > 0) {
        updateNarrative((prev) => ({
          ...prev,
          actualDurationSec: targetDuration,
          scenes: res.scenes,
          outdated: { ...prev.outdated, scenes: false, imagePrompts: true, motionPrompts: true },
        }));
        setSelectedSceneIdx(0);
      }
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

    let scenesToUse = narrative.scenes || [];
    const scenesEnd =
      scenesToUse.length > 0 ? Number(scenesToUse[scenesToUse.length - 1]?.endTime || 0) : 0;
    if (scenesToUse.length > 0 && Math.abs(scenesEnd - effectiveAudioSec) > 0.5) {
      scenesToUse = recalculateSceneTimings(scenesToUse, effectiveAudioSec);
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
          scenes: scenesToUse,
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
          scenes: scenesToUse,
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
      scenes: scenesToUse,
      scenesConfirmed: true,
      currentStage: 7,
      maxUnlockedStage: Math.max(prev.maxUnlockedStage || 6, 7),
    }));
  };

  // --- Stage 7: Image Prompts Only (Generated from Script & Channel Settings) ---
  const handleRegenerateAllPrompts = async () => {
    let scenesToUse = narrative.scenes || [];
    const scenesEnd =
      scenesToUse.length > 0 ? Number(scenesToUse[scenesToUse.length - 1]?.endTime || 0) : 0;
    if (scenesToUse.length > 0 && Math.abs(scenesEnd - effectiveAudioSec) > 0.5) {
      scenesToUse = recalculateSceneTimings(scenesToUse, effectiveAudioSec);
    }

    setBusyMsg(
      isAr
        ? `جاري توليد برومبتات الصور حسب السكريبت وإعدادات قناة "${activeChannel?.name || ""}"...`
        : `Generating standalone Image Prompts from script & "${activeChannel?.name || "Channel"}" settings...`
    );
    setStageError(null);
    try {
      const imgRes = await generateImagePromptsBatch({
        scenes: scenesToUse,
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
        scenes: scenesToUse,
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

  const scenesEnd =
    (narrative.scenes || []).length > 0
      ? Number(narrative.scenes[narrative.scenes.length - 1]?.endTime || 0)
      : 0;
  const isDurationSynced = Math.abs(scenesEnd - effectiveAudioSec) <= 0.5;

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

            {openSettingsFromWorkspace && (() => {
              const keysCount = (getStoredGeminiKeys() || []).length || (globalSettings?.aiSettings?.geminiApiKeys || []).length || 1;
              return (
                <button
                  type="button"
                  onClick={openSettingsFromWorkspace}
                  className="uyns-top-pill text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
                  title={
                    isAr
                      ? `التدوير التلقائي بين المفاتيح مفعّل بدون أي تدخل منك (${keysCount} مفاتيح في الحوض)`
                      : `Automatic Key Rotation Active (${keysCount} keys in pool)`
                  }
                >
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>
                    {isAr
                      ? `تدوير المفاتيح تلقائياً (${keysCount} مفاتيح) ⚡`
                      : `Auto-Rotation (${keysCount} keys) ⚡`}
                  </span>
                </button>
              );
            })()}

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

        {/* Live Multi-Key Failover & Model Switch Notification */}
        {failoverNotice && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs flex items-center justify-between gap-3 shadow-lg animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
              <span className="font-medium leading-relaxed">{failoverNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFailoverNotice(null)}
              className="text-xs text-[var(--muted)] hover:text-white px-2 py-1 rounded bg-[var(--panel-1)] shrink-0"
            >
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
              STAGE 1: NEW PROJECT — REFERENCE & TOPIC CREATION
              ================================================================ */}
          {stage === 1 && (() => {
            const refMode = narrative.reference?.mode || (narrative.reference?.youtubeUrl ? "youtube" : "topic");
            const effectiveTopicTitle = narrative.reference?.topicName || narrative.reference?.title || "";
            const effectiveTopicDesc = narrative.reference?.topicDescription !== undefined
              ? narrative.reference.topicDescription
              : (narrative.reference?.description || "");

            return (
              <div className="uyns-stage-card">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--line-soft)]">
                  <div>
                    <h1 className="uyns-stage-title !mb-1">
                      {isAr
                        ? refMode === "topic"
                          ? "إنشاء مشروع جديد — فكرة موضوع مخصص"
                          : "إنشاء مشروع جديد — تحليل فيديو يوتيوب مرجعي"
                        : refMode === "topic"
                        ? "Create New Project — Direct Topic & Brief"
                        : "Create New Project — YouTube Reference Analysis"}
                    </h1>
                    <p className="text-xs text-[var(--muted)]">
                      {isAr
                        ? "اختر طريقة بدء مشروعك: تحليل فيديو يوتيوب موجود أو كتابة اسم موضوع ووصف مباشر"
                        : "Choose how to start: analyze a proven YouTube video, or define your topic & brief directly"}
                    </p>
                  </div>
                </div>

                {/* Option 1 vs Option 2 Mode Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 mb-5">
                  <button
                    type="button"
                    onClick={() =>
                      updateNarrative((p) => ({
                        ...p,
                        reference: { ...p.reference, mode: "youtube" },
                      }))
                    }
                    className={`p-3.5 rounded-xl border text-right transition-all flex items-start gap-3 cursor-pointer ${
                      refMode === "youtube"
                        ? "bg-[var(--panel-2)] border-[var(--accent)] shadow-sm text-[var(--text)] ring-1 ring-[var(--accent)]/30"
                        : "bg-[var(--panel-1)] border-[var(--line-soft)] text-[var(--muted)] hover:border-[var(--line)] hover:text-[var(--text)]"
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-lg shrink-0 ${
                        refMode === "youtube"
                          ? "bg-red-500/15 text-red-500"
                          : "bg-[var(--panel-2)] text-[var(--muted)]"
                      }`}
                    >
                      <Play className="w-5 h-5 fill-current" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--text)] flex items-center justify-between">
                        <span>{isAr ? "الخيار 1: فيديو يوتيوب مرجعي" : "Option 1: YouTube Reference URL"}</span>
                        {refMode === "youtube" && (
                          <span className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent)]/15 px-2 py-0.5 rounded-full">
                            {isAr ? "محدد ✓" : "Active ✓"}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
                        {isAr
                          ? "تحليل فيديو يوتيوب ناجح واستلهام بنيته السردية، وزوايا الإثارة وصورته المصغرة"
                          : "Analyze a viral YouTube video's hooks, narrative pacing, and visual style"}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateNarrative((p) => ({
                        ...p,
                        reference: { ...p.reference, mode: "topic", youtubeUrl: "" },
                      }))
                    }
                    className={`p-3.5 rounded-xl border text-right transition-all flex items-start gap-3 cursor-pointer ${
                      refMode === "topic"
                        ? "bg-[var(--panel-2)] border-amber-400 shadow-sm text-[var(--text)] ring-1 ring-amber-400/30"
                        : "bg-[var(--panel-1)] border-[var(--line-soft)] text-[var(--muted)] hover:border-[var(--line)] hover:text-[var(--text)]"
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-lg shrink-0 ${
                        refMode === "topic"
                          ? "bg-amber-400/20 text-amber-400"
                          : "bg-[var(--panel-2)] text-[var(--muted)]"
                      }`}
                    >
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--text)] flex items-center justify-between">
                        <span>{isAr ? "الخيار 2: اسم الموضوع + وصف مختصر" : "Option 2: Topic Name & Brief"}</span>
                        {refMode === "topic" && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-400/15 px-2 py-0.5 rounded-full">
                            {isAr ? "محدد ✓" : "Active ✓"}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
                        {isAr
                          ? "أدخل اسم الموضوع مع وصف مختصر (ليس إجباري) وسيتولى الذكاء الاصطناعي بناء الفكرة والستايل"
                          : "Enter topic name with an optional brief description and let AI develop the concept & visual style"}
                      </p>
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
                  <div className="lg:col-span-7 space-y-4">
                    {/* OPTION 1: YouTube Reference URL Inputs */}
                    {refMode === "youtube" ? (
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
                    ) : (
                      /* OPTION 2: Topic Name & Optional Brief Description */
                      <>
                        <div className="uyns-field">
                          <label className="flex items-center justify-between">
                            <span className="font-bold text-[var(--text)]">
                              {isAr ? "اسم الموضوع أو فكرة الفيديو *" : "Topic Name / Subject Title *"}
                            </span>
                            <span className="text-[11px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                              {isAr ? "إجباري" : "Required"}
                            </span>
                          </label>
                          <input
                            type="text"
                            className="font-medium"
                            placeholder={
                              isAr
                                ? "مثال: أسرار الحضارة السومرية واختراع الكتابة، أو كيف يعمل الدماغ أثناء النوم؟ أو لغز مثلث برمودا..."
                                : "e.g. Secrets of the Sumerian Civilization, How the Brain Works in Sleep, The Bermuda Mystery..."
                            }
                            value={effectiveTopicTitle}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateNarrative((p) => ({
                                ...p,
                                reference: { ...p.reference, topicName: val, title: val, mode: "topic", youtubeUrl: "" },
                              }));
                              if (
                                !currentProject?.name ||
                                currentProject.name === "My Awesome Project" ||
                                currentProject.name === "مشروع جديد"
                              ) {
                                onRenameProject(val, true);
                              }
                            }}
                          />
                          <span className="text-[11px] text-[var(--muted)]">
                            {isAr
                              ? "اكتب عنوان الموضوع أو الفكرة العامة التي تريد إنتاج وثائقي أو فيديو سردي حولها."
                              : "Enter the main subject or story topic for your narrative video."}
                          </span>
                        </div>

                        <div className="uyns-field">
                          <label className="flex items-center justify-between">
                            <span className="font-semibold text-[var(--text)]">
                              {isAr ? "وصف مختصر للفكرة (اختياري — ليس إجباري)" : "Brief Description / Creative Angle (Optional — Not Mandatory)"}
                            </span>
                            <span className="text-[11px] text-[var(--muted)] bg-[var(--panel-2)] px-2 py-0.5 rounded">
                              {isAr ? "اختياري (ليس إجباري)" : "Optional"}
                            </span>
                          </label>
                          <textarea
                            rows={3}
                            placeholder={
                              isAr
                                ? "اختياري: اكتب هنا أي تفاصيل، زاوية الطرح المفضلة، الجمهور المستهدف، أو نقاط تود التركيز عليها... يمكنك ترك هذا الحقل فارغاً تماماً وسيقوم الذكاء الاصطناعي ببناء وتطوير الفكرة والقصة بالكامل."
                                : "Optional: Add any specific angles, key points, or target audience... You can leave this completely blank and AI will develop the entire story arc."
                            }
                            value={effectiveTopicDesc}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateNarrative((p) => ({
                                ...p,
                                reference: { ...p.reference, topicDescription: val, description: val },
                              }));
                            }}
                          />
                        </div>

                        {/* Quick Creative Angle Suggestion Chips */}
                        <div className="p-3 rounded-xl bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              {isAr ? "اقتراحات زوايا سريعة (اضغط للإضافة):" : "Suggested Creative Angles (Click to add):"}
                            </span>
                            <span className="text-[10px] text-[var(--muted)]">
                              {isAr ? "تساعد في توجيه السيناريو" : "Guides storytelling angle"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { ar: "أسرار غامضة وغير مروية", en: "Mysterious untold secrets" },
                              { ar: "كيف بدأت القصة والحقيقة الصادمة", en: "How it all began & shocking truth" },
                              { ar: "نقطة التحول التي غيرت مجرى الأحداث", en: "The pivotal turning point" },
                              { ar: "أخطاء كارثية مجهولة لم يلاحظها أحد", en: "Catastrophic unknown blunders" },
                              { ar: "الأثر الخفي الممتد حتى يومنا هذا", en: "The hidden legacy in modern life" },
                              { ar: "الصراع النفسي والدراما الإنسانية", en: "Psychological conflict & human drama" },
                            ].map((angle, aIdx) => (
                              <button
                                key={aIdx}
                                type="button"
                                onClick={() => {
                                  const textToAdd = isAr ? angle.ar : angle.en;
                                  const current = (effectiveTopicDesc || "").trim();
                                  const nextVal = current ? `${current} - التركيز على: ${textToAdd}` : `التركيز على: ${textToAdd}`;
                                  updateNarrative((p) => ({
                                    ...p,
                                    reference: { ...p.reference, topicDescription: nextVal, description: nextVal },
                                  }));
                                }}
                                className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--panel-1)] hover:bg-amber-400/15 hover:text-amber-300 border border-[var(--line-soft)] text-[var(--muted)] transition-all cursor-pointer"
                              >
                                + {isAr ? angle.ar : angle.en}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Direct Prominent Action Button for Option 2 */}
                        <div className="pt-2">
                          <button
                            type="button"
                            disabled={!!busyMsg || !effectiveTopicTitle.trim()}
                            onClick={handleAnalyzeAndContinue}
                            className="uyns-btn uyns-btn--primary w-full justify-center py-3 text-sm font-bold shadow-lg cursor-pointer bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black border-none"
                          >
                            <Sparkles className="w-4 h-4 text-black animate-spin-slow" />
                            <span>
                              {busyMsg
                                ? (isAr ? "جاري تحليل الموضوع وتوليد 5 أفكار وسيناريوهات مقترحة..." : "Analyzing topic & generating 5 concepts...")
                                : (isAr ? "✨ توليد 5 أفكار وسيناريوهات مقترحة للموضوع ←" : "✨ Generate 5 Suggested Concepts for Topic →")}
                            </span>
                          </button>
                          {!effectiveTopicTitle.trim() && (
                            <p className="text-[11px] text-center text-[var(--muted)] mt-1.5">
                              {isAr ? "يرجى كتابة اسم الموضوع أو الفكرة أولاً لتفعيل زر توليد الأفكار" : "Please enter the topic title first to enable concept generation"}
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Shared: Project Name */}
                    <div className="uyns-field">
                      <label>{isAr ? "اسم المشروع *" : "Project Name *"}</label>
                      <input
                        type="text"
                        placeholder="My Awesome Project"
                        value={currentProject?.name || ""}
                        onChange={(e) => onRenameProject(e.target.value, true)}
                      />
                    </div>

                    {/* Shared: Channel Profile Selection */}
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
                                voiceId: ch?.voiceId || p.config?.voiceId || "Charon",
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

                    {/* Shared: Upload Custom Thumbnail / Visual Style Reference */}
                    <div className="uyns-field">
                      <label>
                        {isAr
                          ? refMode === "topic"
                            ? "رفع صورة مصغرة أو ستايل بصري مرجعي (اختياري)"
                            : "رفع صورة مصغرة مخصصة (اختياري)"
                          : refMode === "topic"
                          ? "Upload Style Reference / Thumbnail (Optional)"
                          : "Upload Custom Thumbnail (Optional)"}
                      </label>
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

                    {/* Shared: Notes / Transcript */}
                    <div className="uyns-field">
                      <label>
                        {isAr
                          ? refMode === "topic"
                            ? "ملاحظات أو مراجع إضافية للموضوع (اختياري)"
                            : "نص التفريغ الصوتي أو ملاحظات الفيديو المرجعي (اختياري)"
                          : refMode === "topic"
                          ? "Additional Topic Notes / Outline (Optional)"
                          : "Reference Transcript or Notes (Optional — for spoken pacing analysis)"}
                      </label>
                      <textarea
                        rows={3}
                        placeholder={
                          isAr
                            ? refMode === "topic"
                              ? "اختياري: أضف أي مقالات، روابط، أو نقاط بحثية إضافية لإثراء المعالجة السردية..."
                              : "الصق نص تفريغ الفيديو المرجعي أو ملاحظات إضافية هنا لتحليل أسلوب السرد والإيقاع بدقة..."
                            : refMode === "topic"
                            ? "Optional: Add any research links, quotes, or outline points to enrich the narrative..."
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
                            alt="Reference Thumbnail"
                            referrerPolicy="no-referrer"
                          />
                        ) : refMode === "topic" ? (
                          <div className="uyns-preview-card__empty bg-gradient-to-br from-amber-500/10 via-[var(--panel-2)] to-[var(--panel-1)] flex-col">
                            <Lightbulb className="w-12 h-12 text-amber-400 animate-pulse" />
                            <span className="text-xs font-bold text-[var(--text)] mt-3">
                              {isAr ? "فكرة موضوع مباشر" : "Direct Topic Mode"}
                            </span>
                            <span className="text-[11px] text-[var(--muted)] text-center px-4 mt-1">
                              {isAr
                                ? "سيتم اشتقاق الستايل البصري وتوليد 5 أفكار سينمائية متكاملة بالذكاء الاصطناعي"
                                : "AI will craft a visual style lock and generate 5 distinct concepts"}
                            </span>
                          </div>
                        ) : (
                          <div className="uyns-preview-card__empty">
                            <Play className="w-10 h-10 text-[var(--bad)]" />
                            <span className="text-xs text-[var(--muted)] mt-2">
                              {isAr ? "معاينة الصورة المصغرة للفيديو المرجعي" : "YouTube Reference Thumbnail Preview"}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold flex items-center gap-1.5">
                            {refMode === "topic" ? (
                              <Lightbulb className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Play className="w-4 h-4 text-red-500" />
                            )}
                            <span>
                              {isAr
                                ? refMode === "topic"
                                  ? "معاينة فكرة الموضوع"
                                  : "معاينة سريعة للمرجع"
                                : refMode === "topic"
                                ? "Topic Concept Preview"
                                : "Quick Analysis Preview"}
                            </span>
                          </h3>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            refMode === "topic"
                              ? "bg-amber-400/15 text-amber-400"
                              : "bg-red-500/15 text-red-500"
                          }`}>
                            {refMode === "topic"
                              ? (isAr ? "موضوع مباشر" : "Topic Mode")
                              : (isAr ? "فيديو يوتيوب" : "YouTube")}
                          </span>
                        </div>

                        <div className="text-xs space-y-2 text-[var(--muted)] bg-[var(--panel-2)] p-3 rounded-xl border border-[var(--line-soft)]">
                          <div>
                            <strong className="text-[var(--text)]">
                              {isAr ? (refMode === "topic" ? "الموضوع:" : "العنوان:") : (refMode === "topic" ? "Topic:" : "Title:")}
                            </strong>{" "}
                            <span className="text-[var(--accent)] font-semibold break-words">
                              {refMode === "topic"
                                ? effectiveTopicTitle || (isAr ? "في انتظار إدخال اسم الموضوع..." : "Awaiting topic title...")
                                : narrative.reference?.title || (isAr ? "في انتظار الرابط / الإدخال" : "Awaiting URL / input")}
                            </span>
                          </div>

                          {refMode === "topic" ? (
                            <div>
                              <strong className="text-[var(--text)]">
                                {isAr ? "الوصف:" : "Brief:"}
                              </strong>{" "}
                              <span className="italic break-words">
                                {effectiveTopicDesc ||
                                  (isAr
                                    ? "(اختياري — بناء إبداعي كامل بواسطة الذكاء الاصطناعي)"
                                    : "(Optional — creative freedom by AI)")}
                              </span>
                            </div>
                          ) : (
                            <div>
                              <strong className="text-[var(--text)]">Channel:</strong>{" "}
                              {narrative.reference?.author || "—"}
                            </div>
                          )}

                          {refMode === "youtube" && narrative.reference?.duration && (
                            <div>
                              <strong className="text-[var(--text)]">Duration:</strong>{" "}
                              {narrative.reference.duration}
                            </div>
                          )}

                          {activeChannel && (
                            <div>
                              <strong className="text-[var(--text)]">
                                {isAr ? "النيش والستايل النشط:" : "Active Style Kit:"}
                              </strong>{" "}
                              <span className="text-emerald-400 font-semibold">{activeChannel.name} ({activeChannel.niche})</span>
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
                          className="uyns-btn uyns-btn--primary w-full justify-center mt-4 py-3 cursor-pointer shadow-md"
                        >
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>
                            {busyMsg
                              ? isAr
                                ? "جاري التحليل وتوليد 5 أفكار..."
                                : "Analyzing & Generating Concepts..."
                              : isAr
                              ? refMode === "topic"
                                ? "تحليل الموضوع وتوليد 5 أفكار ←"
                                : "تحليل ومتابعة ←"
                              : refMode === "topic"
                              ? "Analyze Topic & Generate 5 Concepts →"
                              : "Analyze & Continue →"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

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
                      {isAr ? "اكتمل التحليل وتجهيز الأفكار" : "Concepts & Analysis Complete"}
                    </h1>
                    <p className="text-xs text-[var(--muted)]">
                      {isAr
                        ? "قمنا بتجهيز معلومات فكرتك الأصلية وتوليد 5 مقترحات إبداعية بديلة مخصصة لمشروعك."
                        : "We've fully prepared your original idea plus generated 5 alternative creative proposals."}
                    </p>
                  </div>
                </div>

                <div className="uyns-segmented">
                  <button
                    type="button"
                    onClick={() => setConceptTab("concepts")}
                    className={`uyns-segmented__btn ${conceptTab === "concepts" ? "is-active" : ""}`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isAr ? "فكرتك + 5 مقترحات" : "Your Idea + 5 Proposals"}</span>
                    {(narrative.concepts?.length || 0) > 0 && (
                      <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded-full">
                        {narrative.concepts.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConceptTab("analysis")}
                    className={`uyns-segmented__btn ${conceptTab === "analysis" ? "is-active" : ""}`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      {isAr
                        ? narrative.reference?.mode === "topic"
                          ? "استراتيجية الموضوع"
                          : "تحليل المرجع"
                        : narrative.reference?.mode === "topic"
                        ? "Topic Strategy"
                        : "Reference Analysis"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConceptTab("styleLock")}
                    className={`uyns-segmented__btn ${conceptTab === "styleLock" ? "is-active" : ""}`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>{isAr ? "قفل النمط البصري" : "Visual Style Lock"}</span>
                  </button>
                </div>
              </div>

              {/* TAB 1: USER'S ORIGINAL IDEA (PREPARED) + 5 ALTERNATIVE PROPOSALS */}
              {conceptTab === "concepts" && (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-[var(--panel-2)] to-amber-500/10 border border-emerald-500/25">
                    <div>
                      <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        <span>
                          {isAr
                            ? "فكرتك الأصلية المجهزة + 5 مقترحات إبداعية بديلة"
                            : "Your Prepared Original Idea + 5 Creative Proposals"}
                        </span>
                      </h2>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        {isAr
                          ? "اختر فكرتك الأصلية (معلومات مجهزة بالكامل ومطابقة لطلبك) أو اختر أحد المقترحات الـ 5 البديلة للمتابعة."
                          : "Choose your original idea (with all narrative fields prepared) or any of the 5 alternative proposals to proceed."}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={!!busyMsg}
                      onClick={handleRegenerateConcepts}
                      className="uyns-btn uyns-btn--ghost uyns-btn--sm shrink-0 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busyMsg ? "animate-spin" : ""}`} />
                      <span>{isAr ? "توليد 5 مقترحات بديلة أخرى" : "Regenerate 5 Alternatives"}</span>
                    </button>
                  </div>

                  {(!narrative.concepts || narrative.concepts.length === 0) ? (
                    <div className="p-8 rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-1)] text-center space-y-3">
                      <Sparkles className="w-10 h-10 text-amber-400 mx-auto animate-pulse" />
                      <h3 className="text-sm font-bold text-[var(--text)]">
                        {isAr ? "لم تظهر أفكار مقترحة بعد؟" : "No concepts generated yet"}
                      </h3>
                      <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
                        {isAr
                          ? "اضغط الزر أدناه وسيقوم الذكاء الاصطناعي بتجهيز فكرتك الأصلية وتوليد 5 مقترحات فوراً."
                          : "Click the button below to prepare your concept and generate 5 proposals."}
                      </p>
                      <button
                        type="button"
                        disabled={!!busyMsg}
                        onClick={handleRegenerateConcepts}
                        className="uyns-btn uyns-btn--primary mx-auto"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>{isAr ? "تجهيز وتوليد الأفكار الآن ←" : "Prepare Concepts Now →"}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3.5">
                      {narrative.concepts.map((c, idx) => {
                        const isSelected = narrative.selectedConceptId === c.id;
                        const isOriginal = Boolean(c.isUserOriginal || c.id === "user-original-concept");
                        const displayNum = isOriginal ? "🌟" : (narrative.concepts[0]?.isUserOriginal ? idx : idx + 1);
                        return (
                          <div
                            key={c.id || idx}
                            onClick={() => handleSelectConcept(c)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                              isOriginal
                                ? isSelected
                                  ? "bg-gradient-to-r from-emerald-950/40 via-[var(--panel-2)] to-[var(--panel-2)] border-emerald-400 shadow-[0_4px_25px_rgba(16,185,129,0.18)] ring-1 ring-emerald-400/50"
                                  : "bg-gradient-to-r from-emerald-950/20 via-[var(--panel-1)] to-[var(--panel-1)] border-emerald-500/35 hover:border-emerald-500/60 hover:bg-[var(--panel-2)]"
                                : isSelected
                                ? "bg-[var(--panel-2)] border-amber-400 shadow-md ring-1 ring-amber-400/40"
                                : "bg-[var(--panel-1)] border-[var(--line-soft)] hover:border-[var(--line)] hover:bg-[var(--panel-2)]"
                            }`}
                          >
                            <div className="flex items-start gap-3.5">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                                  isOriginal
                                    ? isSelected
                                      ? "bg-emerald-400 text-black shadow-sm text-base"
                                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-base"
                                    : isSelected
                                    ? "bg-amber-400 text-black shadow-sm"
                                    : "bg-[var(--panel-2)] text-[var(--muted)] border border-[var(--line-soft)]"
                                }`}
                              >
                                {displayNum}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-bold text-[var(--text)]">
                                      {c.title}
                                    </h3>
                                    {isOriginal && (
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                                        <span>🌟</span>
                                        <span>{isAr ? "فكرتك الأصلية (معلومات مجهزة بالكامل)" : "Your Original Idea (Fully Prepared)"}</span>
                                      </span>
                                    )}
                                    {!isOriginal && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--panel-2)] text-amber-300/80 border border-amber-500/20">
                                        {isAr ? `💡 مقترح بديل #${displayNum}` : `💡 Alternative #${displayNum}`}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {c.niche && (
                                      <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--panel-2)] text-[var(--muted)] border border-[var(--line-soft)]">
                                        {c.niche} {c.subNiche ? `· ${c.subNiche}` : ""}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditConcept(c, idx);
                                      }}
                                      className="uyns-btn uyns-btn--ghost uyns-btn--sm py-0.5 px-2 text-[11px] hover:text-[var(--text)]"
                                      title={isAr ? "تعديل عنوان وملخص الفكرة" : "Edit Title & Premise"}
                                    >
                                      <Edit3 className="w-3 h-3 text-[var(--accent)]" />
                                      <span>{isAr ? "تعديل" : "Edit"}</span>
                                    </button>
                                    {isSelected && (
                                      <span
                                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                          isOriginal
                                            ? "text-emerald-300 bg-emerald-500/20 border border-emerald-500/30"
                                            : "text-amber-400 bg-amber-400/15"
                                        }`}
                                      >
                                        {isOriginal
                                          ? isAr ? "✓ فكرتك الأصلية المعتمدة" : "✓ Your Active Idea"
                                          : isAr ? "✓ المقترح المختار" : "✓ Active Proposal"}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
                                  {c.premise}
                                </p>

                                <div className="mt-3 pt-3 border-t border-[var(--line-soft)] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                  {c.mainHook && (
                                    <div className="bg-[var(--panel-1)] p-2.5 rounded-lg border border-[var(--line-soft)]">
                                      <strong className="text-amber-400 block mb-1">
                                        {isAr ? "🪝 عنصر الجذب والخطاف (Hook):" : "🪝 Main Hook:"}
                                      </strong>
                                      <span className="text-[var(--text)] text-[11px] leading-relaxed">
                                        {c.mainHook}
                                      </span>
                                    </div>
                                  )}
                                  {c.visualDirection && (
                                    <div className="bg-[var(--panel-1)] p-2.5 rounded-lg border border-[var(--line-soft)]">
                                      <strong className="text-[var(--accent)] block mb-1">
                                        {isAr ? "🎨 الستايل البصري (Visual Style):" : "🎨 Visual Direction:"}
                                      </strong>
                                      <span className="text-[var(--text)] text-[11px] leading-relaxed">
                                        {c.visualDirection}
                                      </span>
                                    </div>
                                  )}
                                  {c.payoff && (
                                    <div className="bg-[var(--panel-1)] p-2.5 rounded-lg border border-[var(--line-soft)]">
                                      <strong className="text-emerald-400 block mb-1">
                                        {isAr ? "💡 الأثر والنتيجة (Payoff):" : "💡 Climax / Payoff:"}
                                      </strong>
                                      <span className="text-[var(--text)] text-[11px] leading-relaxed">
                                        {c.payoff}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--line-soft)]">
                    <button
                      type="button"
                      onClick={() => goToStage(1)}
                      className="uyns-btn uyns-btn--ghost cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>{isAr ? "السابق (تعديل الموضوع)" : "Back (Edit Topic)"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmConceptToConfig}
                      className="uyns-btn uyns-btn--primary cursor-pointer shadow-md py-2.5 px-6"
                    >
                      <span>{isAr ? "التالي: إعدادات الفيديو واختيار القناة ←" : "Next: Configure Video & Select Channel →"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: REFERENCE / TOPIC STRATEGIC ANALYSIS REPORT */}
              {conceptTab === "analysis" && (
                <div className="mt-5 space-y-4">
                  <div className="uyns-card space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[var(--line-soft)]">
                      <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[var(--accent)]" />
                        <span>
                          {isAr
                            ? narrative.reference?.mode === "topic"
                              ? "تقرير التحليل الاستراتيجي لفكرة الموضوع"
                              : "تقرير التحليل الاستراتيجي للمرجع"
                            : "Strategic Reference Analysis"}
                        </span>
                      </h2>
                      <span className="text-xs text-[var(--muted)]">
                        {narrative.reference?.mode === "topic"
                          ? (isAr ? "موضوع مباشر" : "Direct Topic Mode")
                          : (isAr ? "فيديو يوتيوب مرجعي" : "YouTube Reference")}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-1.5">
                        <strong className="text-[var(--muted)] block">{isAr ? "الموضوع الرئيسي:" : "Main Topic:"}</strong>
                        <span className="text-[var(--text)] font-semibold">{narrative.analysis?.mainTopic || "—"}</span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-1.5">
                        <strong className="text-[var(--muted)] block">{isAr ? "النيش والتصنيف الفرعي:" : "Niche & Sub-Niche:"}</strong>
                        <span className="text-[var(--text)] font-semibold">
                          {narrative.analysis?.niche || "—"} {narrative.analysis?.subNiche ? `· ${narrative.analysis.subNiche}` : ""}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-1.5">
                        <strong className="text-[var(--muted)] block">{isAr ? "الجمهور المستهدف:" : "Target Audience:"}</strong>
                        <span className="text-[var(--text)]">{narrative.analysis?.targetAudience || "—"}</span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-1.5">
                        <strong className="text-[var(--muted)] block">{isAr ? "فجوة الفضول (Curiosity Gap):" : "Curiosity Gap:"}</strong>
                        <span className="text-[var(--text)]">{narrative.analysis?.curiosityGap || "—"}</span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-1.5">
                        <strong className="text-[var(--muted)] block">{isAr ? "خطاف البداية (Opening Hook):" : "Opening Hook:"}</strong>
                        <span className="text-[var(--text)]">{narrative.analysis?.openingHook || "—"}</span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-1.5">
                        <strong className="text-[var(--muted)] block">{isAr ? "نبرة السرد والإيقاع:" : "Narration Tone & Pacing:"}</strong>
                        <span className="text-[var(--text)]">{narrative.analysis?.narrationTone || "—"}</span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-1.5">
                        <strong className="text-[var(--muted)] block">{isAr ? "الستايل البصري المستنتج:" : "Visual Style:"}</strong>
                        <span className="text-[var(--text)]">{narrative.analysis?.visualStyle || "—"}</span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-1.5">
                        <strong className="text-[var(--muted)] block">{isAr ? "لوحة الألوان المتناغمة:" : "Color Palette:"}</strong>
                        <span className="text-[var(--text)]">{narrative.analysis?.colorPalette || "—"}</span>
                      </div>
                    </div>

                    {narrative.analysis?.engagementFactors?.length > 0 && (
                      <div className="pt-3 border-t border-[var(--line-soft)]">
                        <h3 className="text-xs font-bold text-[var(--text)] mb-2">
                          {isAr ? "أسرار وعوامل الجذب العالية (High-Retention Elements):" : "High-Retention Factors:"}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {narrative.analysis.engagementFactors.map((ef, i) => (
                            <span key={i} className="text-xs px-2.5 py-1 rounded-md bg-[var(--panel-2)] border border-[var(--line-soft)] text-emerald-400 font-medium">
                              ✓ {ef}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-4 flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() => setConceptTab("concepts")}
                        className="uyns-btn uyns-btn--primary"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{isAr ? "الاطلاع على الـ 5 أفكار المقترحة ←" : "View 5 Proposed Concepts →"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: VISUAL STYLE LOCK */}
              {conceptTab === "styleLock" && (
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

                  <div className="pt-4 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setConceptTab("concepts")}
                      className="uyns-btn uyns-btn--primary"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{isAr ? "العودة للأفكار المقترحة ←" : "Back to Concepts →"}</span>
                    </button>
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

                    {/* Manual Duration Override Input */}
                    <div className="p-3.5 rounded-xl bg-[var(--panel-1)] border border-[var(--line-soft)] space-y-2">
                      <label className="text-xs font-bold text-[var(--text)] flex items-center justify-between">
                        <span>{isAr ? "تحديد أو تعديل مدة الفيديو يدوياً (اختياري):" : "Manual Duration Override (Optional):"}</span>
                        <span className="text-[10px] text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded">
                          {isAr ? "يتحكم بتوقيت المشاهد" : "Controls Scene Timings"}
                        </span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={isAr ? "مثال: 10:25 أو 12:30 أو 625 (ثانية)" : "e.g. 10:25, 12:30, or 625s"}
                          value={narrative.manualDurationInput || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const parsed = parseDurationInput(val);
                            updateNarrative((p) => {
                              const nextScenes =
                                parsed > 0 && p.scenes && p.scenes.length > 0
                                  ? recalculateSceneTimings(p.scenes, parsed)
                                  : p.scenes;
                              return {
                                ...p,
                                manualDurationInput: val,
                                actualDurationSec: parsed || p.actualDurationSec,
                                scenes: nextScenes,
                                outdated: {
                                  ...p.outdated,
                                  scenes: true,
                                  imagePrompts: true,
                                },
                              };
                            });
                          }}
                        />
                        {narrative.manualDurationInput && (
                          <button
                            type="button"
                            onClick={() => {
                              updateNarrative((p) => {
                                const fallbackSec =
                                  audioDuration > 0
                                    ? audioDuration
                                    : (p.config?.targetDurationMinutes || 10) * 60;
                                const nextScenes =
                                  p.scenes && p.scenes.length > 0
                                    ? recalculateSceneTimings(p.scenes, fallbackSec)
                                    : p.scenes;
                                return {
                                  ...p,
                                  manualDurationInput: "",
                                  actualDurationSec: fallbackSec,
                                  scenes: nextScenes,
                                  outdated: { ...p.outdated, scenes: true, imagePrompts: true },
                                };
                              });
                            }}
                            className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                          >
                            {isAr ? "إعادة ضبط" : "Clear"}
                          </button>
                        )}
                      </div>

                      {/* Quick Presets for Precise Durations */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-[var(--muted)]">
                          {isAr ? "توقيتات سريعة:" : "Quick Presets:"}
                        </span>
                        {["10:25", "10:00", "08:30", "05:00"].map((preset) => {
                          const pSec = parseDurationInput(preset);
                          const isActive =
                            narrative.manualDurationInput?.trim() === preset ||
                            (!narrative.manualDurationInput &&
                              Math.abs(effectiveAudioSec - pSec) < 0.5);
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                updateNarrative((p) => {
                                  const nextScenes =
                                    p.scenes && p.scenes.length > 0
                                      ? recalculateSceneTimings(p.scenes, pSec)
                                      : p.scenes;
                                  return {
                                    ...p,
                                    manualDurationInput: preset,
                                    actualDurationSec: pSec,
                                    scenes: nextScenes,
                                    outdated: { ...p.outdated, scenes: true, imagePrompts: true },
                                  };
                                });
                              }}
                              className={`uyns-btn uyns-btn--sm text-xs py-0.5 px-2 ${
                                isActive
                                  ? "uyns-btn--primary font-mono font-bold"
                                  : "uyns-btn--ghost font-mono text-[var(--muted)]"
                              }`}
                            >
                              {preset}
                            </button>
                          );
                        })}
                      </div>

                      <p className="text-[10px] text-[var(--muted)]">
                        {isAr
                          ? "إذا أردت فرض مدة محددة للمشاهد وبرومبتات الصور (مثال 10:25)، اكتبها أو اخترها أعلاه وسيتم ضبط كل المشاهد بدقة فوراً."
                          : "Enter or select an exact duration (e.g. 10:25) to strictly enforce scene timing and standalone image prompt timestamps."}
                      </p>
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
                    {isAr ? "المدة المستهدفة للصوت:" : "Target Audio Duration:"}{" "}
                    <span className="font-mono text-[var(--accent)] font-bold">
                      {formatDurationClock(effectiveAudioSec)}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!!busyMsg}
                    onClick={() => handleRegenerateScenes()}
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

              {/* Timing Synchronization & Scene Pacing Control Bar */}
              <div className="mb-4 p-3.5 rounded-xl bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[var(--muted)]">{isAr ? "مدة الصوت المعتمدة:" : "Target Audio Duration:"}</span>
                    <span className="font-mono font-bold text-[var(--accent)] text-sm px-2 py-0.5 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                      {formatDurationClock(effectiveAudioSec)} ({effectiveAudioSec}s)
                    </span>
                    {isDurationSynced ? (
                      <span className="px-2 py-0.5 rounded bg-[rgba(0,245,155,0.12)] text-[var(--accent)] text-[11px] font-bold">
                        {isAr ? "✓ المشاهد متزامنة بدقة مع الصوت" : "✓ Scenes Strictly Synced"}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[11px] font-bold">
                        {isAr
                          ? `⚠️ المشاهد تنتهي عند ${formatDurationClock(scenesEnd)}`
                          : `⚠️ Scenes end at ${formatDurationClock(scenesEnd)}`}
                      </span>
                    )}
                  </div>

                  {!isDurationSynced && (narrative.scenes || []).length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoSyncSceneTimings}
                      className="uyns-btn uyns-btn--sm bg-[var(--accent)] text-black font-bold hover:brightness-110"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {isAr
                          ? `ضبط المشاهد فوراً لمطابقة ${formatDurationClock(effectiveAudioSec)}`
                          : `Auto-Sync Scenes to ${formatDurationClock(effectiveAudioSec)}`}
                      </span>
                    </button>
                  )}
                </div>

                {/* Pacing Preset Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--line-soft)]">
                  <span className="text-[11px] text-[var(--muted)]">
                    {isAr ? "سرعة المشاهد وتعدادها المتوقع:" : "Scene Pacing & Estimated Count:"}
                  </span>
                  {[
                    { labelAr: "سريع (~6 ث)", labelEn: "Fast (~6s)", pace: 6 },
                    { labelAr: "متوازن (~10 ث)", labelEn: "Balanced (~10s)", pace: 10 },
                    { labelAr: "سينمائي (~15 ث)", labelEn: "Cinematic (~15s)", pace: 15 },
                    { labelAr: "سردي هادئ (~20 ث)", labelEn: "Narrative (~20s)", pace: 20 },
                  ].map((item) => {
                    const isSel = scenePaceSec === item.pace;
                    const count = Math.max(4, Math.round(effectiveAudioSec / item.pace));
                    return (
                      <button
                        key={item.pace}
                        type="button"
                        onClick={() => {
                          setScenePaceSec(item.pace);
                          handleRegenerateScenes(item.pace);
                        }}
                        disabled={!!busyMsg}
                        className={`uyns-btn uyns-btn--sm text-xs py-1 px-2.5 ${
                          isSel ? "uyns-btn--primary font-bold" : "uyns-btn--ghost text-[var(--muted)]"
                        }`}
                      >
                        <span>{isAr ? item.labelAr : item.labelEn}</span>
                        <span className="font-mono text-[10px] opacity-75">
                          (~{count} {isAr ? "مشهد" : "scenes"})
                        </span>
                      </button>
                    );
                  })}
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
                    {(narrative.imagePrompts || []).length} {isAr ? "برومبت مستقل" : "standalone prompts"} ·{" "}
                    {isAr ? "المدة المستهدفة للصوت:" : "Target Audio Duration:"}{" "}
                    <span className="font-mono text-[var(--accent)] font-bold">
                      {formatDurationClock(effectiveAudioSec)}
                    </span>
                    {" "}· {isAr ? `قناة "${activeChannel?.name || ""}" (${activeChannel?.aspectRatio || "16:9"})` : `Channel "${activeChannel?.name || "Channel"}" (${activeChannel?.aspectRatio || "16:9"})`}
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
