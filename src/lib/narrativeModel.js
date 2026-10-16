// Unified Project Data Model, Default Presets, Dependency Invalidation & Bilingual Translations
// for Universal YouTube Narrative Studio

export const WORKFLOW_STAGES = [
  { id: 1, key: "reference", labelEn: "Reference", labelAr: "المرجع" },
  { id: 2, key: "concept", labelEn: "Concept", labelAr: "الفكرة" },
  { id: 3, key: "configure", labelEn: "Configure", labelAr: "الإعدادات" },
  { id: 4, key: "script", labelEn: "Script", labelAr: "السيناريو" },
  { id: 5, key: "audio", labelEn: "Audio & Timing", labelAr: "الصوت والتوقيت" },
  { id: 6, key: "scenes", labelEn: "Scenes", labelAr: "المشاهد" },
  { id: 7, key: "prompts", labelEn: "Prompts", labelAr: "الأوامر" },
  { id: 8, key: "assets", labelEn: "Assets", labelAr: "الملفات" },
  { id: 9, key: "editor", labelEn: "Editor", labelAr: "المحرر" },
  { id: 10, key: "seo", labelEn: "SEO & Overview", labelAr: "السيو والنشر" },
];

export const DEFAULT_SCRIPT_PRESETS = [
  {
    id: "documentary",
    name: "Documentary (Engaging & Informative)",
    nameAr: "وثائقي (مشوق ومعلوماتي)",
    tone: "Investigative, authoritative, curious",
    pov: "Second-person ('you') & third-person narrative",
    pacing: "Measured build-up with strong curiosity gaps",
    hookStyle: "Provocative question or little-known paradox",
    endingStyle: "Thought-provoking takeaway that ties back to the opening hook",
    language: "English (US)",
    instructions: "Open with an immediate curiosity gap, weave historical/scientific facts into a human story, and maintain suspense between chapters.",
  },
  {
    id: "cinematic",
    name: "Cinematic Storytelling",
    nameAr: "سرد سينمائي",
    tone: "Atmospheric, immersive, dramatic",
    pov: "Immersive second-person ('Imagine standing...')",
    pacing: "Slow burn with vivid sensory details",
    hookStyle: "In media res scene drop",
    endingStyle: "Emotional resonance and cinematic closure",
    language: "English (US)",
    instructions: "Use rich sensory imagery, short punchy sentences during high tension, and natural '...' pauses for voiceover atmosphere.",
  },
  {
    id: "mystery",
    name: "Mystery & Suspense",
    nameAr: "غموض وتشويق",
    tone: "Suspenseful, analytical, intriguing",
    pov: "Investigative narrator",
    pacing: "Layered clues leading to a revelation",
    hookStyle: "Unexplained anomaly or disappearance",
    endingStyle: "Competing theories and haunting final question",
    language: "English (US)",
    instructions: "Present evidence step by step, withhold the key revelation until the final third, and avoid sensational clichés.",
  },
  {
    id: "educational",
    name: "Educational Explainer",
    nameAr: "شرح تعليمي مبسط",
    tone: "Clear, enthusiastic, accessible",
    pov: "Direct conversational ('you' / 'we')",
    pacing: "Brisk, structured from simple to complex",
    hookStyle: "Surprising everyday connection",
    endingStyle: "Clear summary and practical insight",
    language: "English (US)",
    instructions: "Break down complex concepts using relatable analogies, clear cause-and-effect transitions, and zero jargon.",
  },
  {
    id: "conversational",
    name: "Conversational Narration",
    nameAr: "سرد حواري عفوي",
    tone: "Warm, relatable, candid",
    pov: "First & second person",
    pacing: "Natural spoken cadence",
    hookStyle: "Relatable observation or direct question",
    endingStyle: "Friendly reflection and audience question",
    language: "English (US)",
    instructions: "Write like a knowledgeable friend explaining a fascinating story over coffee. Keep sentences natural for spoken delivery.",
  },
  {
    id: "emotional",
    name: "Emotional Storytelling",
    nameAr: "قصة إنسانية مؤثرة",
    tone: "Empathetic, reflective, heartfelt",
    pov: "Character-centered narrative",
    pacing: "Gentle, emotionally paced",
    hookStyle: "Intimate pivotal moment",
    endingStyle: "Inspiring human resolution",
    language: "English (US)",
    instructions: "Focus on human stakes, inner conflict, and authentic emotional beats without melodrama.",
  },
];

export const DEFAULT_VISUAL_PRESETS = [
  {
    id: "cinematic_realistic",
    name: "Cinematic Realistic",
    nameAr: "واقعي سينمائي",
    colorPalette: "Deep teal shadows, warm amber highlights, rich atmospheric contrast",
    lighting: "Volumetric golden hour and dramatic rim lighting",
    characterRules: "Photorealistic proportions, expressive natural faces, period/topic-accurate attire",
    composition: "35mm anamorphic widescreen framing, shallow depth of field, rule of thirds",
    detailLevel: "Ultra-detailed 8k textures, realistic atmospheric haze",
    aspectRatio: "16:9",
    negativePrompt: "no text, no watermarks, no subtitles, no cartoon outlines, no deformed hands",
    thumbGradient: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
  },
  {
    id: "flat_2d_cartoon",
    name: "Flat 2D Cartoon",
    nameAr: "كرتون مسطح 2D",
    colorPalette: "Vibrant saturated primaries with deep navy backgrounds",
    lighting: "Clean cel-shaded flat lighting with soft ambient glow",
    characterRules: "Clean vector silhouette, minimalist expressive eyes, consistent outfit colors",
    composition: "Clear foreground subject against layered geometric background",
    detailLevel: "Crisp vector linework, smooth flat shading",
    aspectRatio: "16:9",
    negativePrompt: "no photorealism, no 3D render, no blurry textures, no text in frame",
    thumbGradient: "linear-gradient(135deg, #3b1d5a 0%, #6b2d5c 50%, #f06543 100%)",
  },
  {
    id: "3d_animation",
    name: "3D Animation",
    nameAr: "أنيميشن ثلاثي الأبعاد 3D",
    colorPalette: "Rich Pixar-inspired warm & cool complementary tones",
    lighting: "Soft global illumination, subsurface scattering, cinematic key light",
    characterRules: "Stylized 3D characters with appealing proportions and tactile fabric textures",
    composition: "Dynamic camera angles with soft bokeh background depth",
    detailLevel: "High-craft stylized 3D materials",
    aspectRatio: "16:9",
    negativePrompt: "no 2D flat sketch, no low-poly artifacts, no text or watermarks",
    thumbGradient: "linear-gradient(135deg, #1a2a6c 0%, #b21f1f 50%, #fdbb2d 100%)",
  },
  {
    id: "anime_illustration",
    name: "Anime Illustration",
    nameAr: "رسوم أنمي سينمائية",
    colorPalette: "Makoto Shinkai inspired luminous skies, rich twilight blues and warm glows",
    lighting: "Dramatic sunlight shafts, glowing reflections, atmospheric bloom",
    characterRules: "Expressive anime character design, crisp line art, consistent hair and attire",
    composition: "Wide emotive environmental framing with detailed backgrounds",
    detailLevel: "Hand-painted anime background detail with crisp cel characters",
    aspectRatio: "16:9",
    negativePrompt: "no western 3d, no photorealistic skin, no text in frame",
    thumbGradient: "linear-gradient(135deg, #2b5876 0%, #4e4376 100%)",
  },
  {
    id: "documentary_visuals",
    name: "Documentary Archival & Visuals",
    nameAr: "وثائقي وتاريخي",
    colorPalette: "Muted earth tones, archival sepia/slate accents, natural film grain",
    lighting: "Naturalistic directional window or overcast daylight",
    characterRules: "Authentic historical/real-world accuracy, dignified posture",
    composition: "Editorial photojournalism framing, balanced symmetry",
    detailLevel: "Tactile archival realism, fine film texture",
    aspectRatio: "16:9",
    negativePrompt: "no neon sci-fi glow, no oversaturated plastic look, no text",
    thumbGradient: "linear-gradient(135deg, #232526 0%, #414345 100%)",
  },
  {
    id: "minimalist_illustration",
    name: "Minimalist Editorial Illustration",
    nameAr: "رسم توضيحي بسيط",
    colorPalette: "Curated 4-color editorial palette (midnight, cream, coral, teal)",
    lighting: "Dramatic graphic shadow shapes",
    characterRules: "Stylized faceless or semi-abstract editorial figures with bold silhouettes",
    composition: "Conceptual poster-like framing with generous negative space",
    detailLevel: "Subtle risograph paper grain, clean geometric forms",
    aspectRatio: "16:9",
    negativePrompt: "no photorealism, no cluttered backgrounds, no text",
    thumbGradient: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
  },
];

// Supported voices via Gemini 3.8 TTS
export const SUPPORTED_VOICES = [
  { id: "Kore", label: "Kore (Warm & Clear — Gemini TTS)", gender: "Female", provider: "gemini" },
  { id: "Charon", label: "Charon (Deep & Authoritative — Gemini TTS)", gender: "Male", provider: "gemini" },
  { id: "Puck", label: "Puck (Energetic & Engaging — Gemini TTS)", gender: "Male", provider: "gemini" },
  { id: "Fenrir", label: "Fenrir (Resonant & Suspenseful — Gemini TTS)", gender: "Male", provider: "gemini" },
  { id: "Zephyr", label: "Zephyr (Calm & Conversational — Gemini TTS)", gender: "Female", provider: "gemini" },
];

export const GEMINI_TEXT_MODELS = [
  // Gemini 3 & 4 Series (Strictly Valid Active Models)
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (فائق السرعة وخفة المعالجة — الموصى به)", category: "Gemini 3", tag: "الأسرع والأفضل", isRecommended: true },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview (تفكير عميق واستنتاج متقدم وشامل)", category: "Gemini 3", tag: "أعلى ذكاء" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (أقصى سرعة واستجابة فورية)", category: "Gemini 3", tag: "فائق الخفة" },
  { id: "gemini-4-argon", label: "Gemini 4 Argon (النموذج الفائق للقدرات والمهام المعقدة)", category: "Gemini 4", tag: "الأقوى" },

  // Always Latest Aliases
  { id: "gemini-flash-latest", label: "Gemini Flash Latest (أحدث إصدار Flash تلقائياً)", category: "الأحدث دائماً", tag: "تحديث تلقائي" },
  { id: "gemini-pro-latest", label: "Gemini Pro Latest (أحدث إصدار Pro تلقائياً)", category: "الأحدث دائماً", tag: "تحديث تلقائي" },
];

export const GEMINI_IMAGE_MODELS = [
  { id: "gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite Image (Fast Scene Generation)" },
  { id: "gemini-nano-banana-2.1", label: "Gemini Nano Banana 2.1 (High Detail)" },
];

export const GEMINI_TTS_MODELS = [
  { id: "gemini-3.8-flash-lite-tts", label: "Gemini 3.8 Flash Lite TTS (Ultra-Fast Voiceover)" },
  { id: "gemini-3.8-flash-tts", label: "Gemini 3.8 Flash TTS (Expressive Narration)" },
];

export const DEFAULT_CHANNELS = [
  {
    id: "channel_default_1",
    name: "Main Documentary Channel",
    niche: "History, Science & Deep Mysteries",
    aspectRatio: "16:9",
    voiceId: "Charon",
    promptRules:
      "SCRIPT RULES: Open with a paradoxical curiosity hook in the first 15 seconds, structured into 4 clear narrative chapters, conversational yet deeply researched with natural pauses.\nSCENE & IMAGE RULES: Cinematic realistic illustration, deep oceanic blues and warm amber rim lighting, consistent character proportions, 35mm widescreen depth of field, no text inside scene frames.\nTHUMBNAIL RULES: High-contrast focal subject on the right, dramatic rim lighting, curiosity-gap visual metaphor, bold 3-word overlay text space on the left.",
    additionalScriptRules:
      "Avoid generic openings like 'In today's video'. Use vivid sensory language, active verbs, and natural '...' pauses for dramatic narration.",
    additionalSceneRules:
      "Alternate between wide establishing shots, medium narrative shots, and tight close-ups on emotional or historical details.",
    narrationStyle:
      "Investigative, calm, authoritative voiceover with natural curiosity gaps and 1.5s pauses after hooks",
    scriptStyle:
      "Open with a paradoxical question in the first 15 seconds, structured into 4 clear narrative acts, conversational yet deeply researched",
    motionStyle:
      "Slow cinematic push-ins (zoomin), alternating gentle zoomout, subtle atmospheric dust/light motion, smooth crossfades between scenes",
    visualStyleRules:
      "Cinematic realistic illustration, deep oceanic blues and warm amber rim lighting, consistent character proportions, 35mm widescreen depth of field",
    thumbnailStyleRules:
      "High-contrast dramatic composition, clear central subject with expressive emotion or mystery element, vibrant rim lighting, space for 2-4 bold words",
    avatarCharacterDesc:
      "Narrator avatar wearing a dark navy tailored coat with subtle warm rim light, expressive eyes, consistent across intro/outro",
    styleReferenceImages: [], // [{ id, name, dataUrl, mimeType }]
    thumbnailReferenceImages: [], // [{ id, name, dataUrl, mimeType }]
    avatarImages: [], // [{ id, name, dataUrl, mimeType }]
    editorConfig: {
      transitionType: "fade", // "cut" | "fade" | "fadeblack" | "wipeleft" | "wiperight" | "slideleft" | "slideright" | "circleopen" | "mix"
      transitionDuration: 0.4,
      motionMode: "alternate", // "alternate" | "zoomin" | "zoomout" | "none"
      motionAmount: 0.08,
      effectId: "cinema", // from EFFECTS in effects.js
      effectIntensity: 0.5,
      fadeIn: 0.5,
      fadeOut: 0.6,
      captionsOn: true,
      captionStyle: "classic", // "classic" | "boxed" | "yellow" | "bar" | "shadow" | "bold" | "mint" | "cinema"
      captionFont: "montserrat", // "default" | "montserrat" | "anton" | "poppins"
      captionColor: "#FFFFFF",
      captionAnimation: "pop", // "pop" | "typewriter" | "fade" | "none"
      captionSize: "md", // "sm" | "md" | "lg"
      captionPosition: 0, // -1 (top), 0 (bottom), etc.
    },
  },
];

export function createDefaultGlobalSettings() {
  return {
    channels: DEFAULT_CHANNELS,
    defaultChannelId: "channel_default_1",
    scriptPresets: DEFAULT_SCRIPT_PRESETS,
    visualPresets: DEFAULT_VISUAL_PRESETS,
    defaultScriptPresetId: "documentary",
    defaultVisualPresetId: "cinematic_realistic",
    imageSettings: {
      provider: "gemini",
      aspectRatio: "16:9",
      quality: "High (1080p / 4K Prompt Spec)",
      defaultFraming: "medium shot",
      batchSize: 20,
      negativePrompt: "no text in this frame, no watermarks, no logos, no deformed anatomy",
    },
    voiceSettings: {
      provider: "gemini",
      voiceId: "Charon",
      language: "English (US)",
      speed: 1.0,
      format: "WAV / MP3",
    },
    aiSettings: {
      activeProvider: "gemini", // "gemini" | "external"
      textProvider: "gemini",
      imageProvider: "gemini",
      audioProvider: "gemini",
      textModel: "gemini-3.8-flash",
      imageModel: "gemini-3.1-flash-lite-image",
      ttsModel: "gemini-3.8-flash-lite-tts",
      ttsVoice: "Charon",
      geminiApiKeys: [],
      externalApi: {
        enabled: false,
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      },
    },
  };
}

export function createDefaultNarrativeData(globalSettings = null) {
  const gs = globalSettings || createDefaultGlobalSettings();
  const defaultCh =
    (gs.channels || []).find((c) => c.id === gs.defaultChannelId) || gs.channels?.[0] || null;
  return {
    currentStage: 1,
    maxUnlockedStage: 1,
    status: "Draft", // "Draft" | "In Progress" | "Ready for Editing" | "Completed"
    progressPct: 10,
    channelId: defaultCh?.id || "",
    outdated: {
      concept: false,
      script: false,
      audio: false,
      scenes: false,
      imagePrompts: false,
      motionPrompts: false,
      seo: false,
    },
    reference: {
      youtubeUrl: "",
      videoId: "",
      title: "",
      author: "",
      description: "",
      duration: "",
      views: "",
      thumbnailUrl: "",
      thumbnailBase64: null,
      thumbnailMime: "image/jpeg",
      pastedTranscript: "",
      nichePreference: "",
      languagePreference: "English (US)",
      notice: "",
      analyzedAt: null,
    },
    analysis: null,
    visualStyleLock: {
      artStyle: "Cinematic Realistic Illustration",
      characterRules: "Consistent character proportions, expressive natural features",
      facialVisibility: "Clear expressive faces, well-lit eyes",
      clothingSilhouette: "Topic-appropriate authentic clothing and recognizable silhouette",
      colorPalette: "Deep oceanic blues, warm amber highlights, rich shadows",
      lighting: "Volumetric cinematic lighting with soft rim highlights",
      backgroundTreatment: "Layered atmospheric depth with subtle bokeh",
      composition: "Balanced cinematic widescreen framing",
      lineworkShading: "Clean edges, smooth painterly shading",
      aspectRatio: "16:9",
      approved: false,
    },
    concepts: [],
    selectedConceptId: null,
    selectedConcept: null,
    config: {
      targetDurationMinutes: 12,
      scriptPresetId: gs.defaultScriptPresetId || "documentary",
      visualPresetId: gs.defaultVisualPresetId || "cinematic_realistic",
      language: gs.voiceSettings?.language || "English (US)",
      imageProvider: gs.imageSettings?.provider || "Gemini Prompt Engine",
      voiceProvider: gs.voiceSettings?.provider || "Gemini 3.8 TTS",
      voiceId: gs.voiceSettings?.voiceId || "Charon",
      aspectRatio: gs.imageSettings?.aspectRatio || "16:9",
      negativePrompt: gs.imageSettings?.negativePrompt || "no text in this frame",
      confirmed: false,
      settingsSnapshot: JSON.parse(JSON.stringify(gs)),
    },
    scriptDraft: "",
    approvedScript: "",
    scriptApprovedAt: null,
    actualDurationSec: 0,
    manualDurationInput: "",
    audioConfirmed: false,
    scenes: [],
    scenesConfirmed: false,
    imagePrompts: [],
    imagePromptsConfirmed: false,
    motionPrompts: [],
    motionPromptsConfirmed: false,
    assetsConfirmed: false,
    seoPackage: null,
  };
}

// Parse "12:55" or "00:12:55" or seconds string into seconds number
export function parseDurationInput(str) {
  if (!str) return 0;
  const clean = String(str).trim();
  if (/^\d+(\.\d+)?$/.test(clean)) return Math.max(0, parseFloat(clean));
  const parts = clean.split(":").map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return 0;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

export function formatDurationClock(sec) {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "0:00";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatFilenameTimestamp(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}-${String(rem).padStart(2, "0")}`;
}

// Recalculate sequential, non-overlapping scene timings when total audio duration changes
// or when scenes are merged, split, or reordered.
export function recalculateSceneTimings(scenes, totalDurationSec) {
  if (!Array.isArray(scenes) || scenes.length === 0) return [];
  const totalSec = Math.max(5, Number(totalDurationSec) || 60);
  const weights = scenes.map((s) => {
    const txt = String(s.scriptExcerpt || "").trim();
    const wordCount = Math.max(1, txt.split(/\s+/).filter(Boolean).length);
    const pauseMarks = (txt.match(/(\.\.\.|[.!?؟،—;:]+)/g) || []).length;
    const charFactor = Math.max(1, txt.length / 5.2);
    return wordCount * 0.65 + charFactor * 0.35 + pauseMarks * 0.85;
  });
  const sumWeights = weights.reduce((a, b) => a + b, 0) || 1;

  let cursor = 0;
  return scenes.map((s, idx) => {
    const isLast = idx === scenes.length - 1;
    const startTime = idx === 0 ? 0 : cursor;
    const rawDur = (weights[idx] / sumWeights) * totalSec;
    const endTime = isLast ? totalSec : Math.min(totalSec, +(startTime + rawDur).toFixed(1));
    const duration = Math.max(1.2, +(endTime - startTime).toFixed(1));
    cursor = +(startTime + duration).toFixed(1);
    return {
      ...s,
      sceneNumber: idx + 1,
      startTime,
      endTime: isLast ? totalSec : cursor,
      duration: isLast ? Math.max(1.0, +(totalSec - startTime).toFixed(1)) : duration,
    };
  });
}

// Compute overall workflow progress percentage and status label
export function computeProjectStatus(narrative, hasBuiltEditor) {
  if (!narrative) return { progressPct: 10, status: "Draft" };
  let completedSteps = 0;
  if (narrative.analysis && narrative.concepts?.length) completedSteps++;
  if (narrative.selectedConcept) completedSteps++;
  if (narrative.config?.confirmed) completedSteps++;
  if (narrative.approvedScript) completedSteps++;
  if (narrative.audioConfirmed && narrative.actualDurationSec > 0) completedSteps++;
  if (narrative.scenesConfirmed && narrative.scenes?.length > 0) completedSteps++;
  if (narrative.imagePrompts?.length > 0) completedSteps++;
  if (narrative.motionPrompts?.length > 0) completedSteps++;
  if (narrative.assetsConfirmed) completedSteps++;
  if (hasBuiltEditor || narrative.seoPackage) completedSteps++;

  const progressPct = Math.min(100, Math.max(8, Math.round((completedSteps / 10) * 100)));
  let status = "Draft";
  if (narrative.seoPackage && hasBuiltEditor) status = "Completed";
  else if (narrative.assetsConfirmed || hasBuiltEditor) status = "Ready for Editing";
  else if (completedSteps >= 1) status = "In Progress";

  return { progressPct, status };
}
