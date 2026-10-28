"use client";
import { useState, useEffect } from "react";
import {
  SUPPORTED_VOICES,
  GEMINI_TEXT_MODELS,
  GEMINI_IMAGE_MODELS,
  GEMINI_TTS_MODELS,
  createDefaultGlobalSettings,
} from "../lib/narrativeModel";
import {
  fetchProviderStatus,
  fetchAccountStatus,
  syncAccountStatus,
  updateServerGeminiConfig,
  getStoredGeminiKeys,
  setStoredGeminiKeys,
  getStoredExternalConfig,
  setStoredExternalConfig,
  updateServerExternalConfig,
  testExternalApiConnection,
  fetchAvailableGeminiModels,
  getStoredGeminiTextModel,
  setStoredGeminiTextModel,
} from "../lib/aiService";
import { showConfirm, showPrompt } from "./Dialog";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Sun,
  Moon,
  Globe,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Zap,
  ShieldCheck,
  Server,
  Sliders,
  Sparkles,
} from "lucide-react";

function parseMultiKeysText(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => parseMultiKeysText(item));
  }
  return String(raw)
    .split(/[\n\r,;|\s]+/)
    .map((k) => k.trim().replace(/^["']+|["']+$/g, ""))
    .filter((k) => k.length >= 15);
}

export default function SettingsView({
  settings,
  onSaveSettings,
  theme,
  setTheme,
  uiLang,
  setUiLang,
}) {
  const isAr = uiLang === "ar";
  const [local, setLocal] = useState(() => {
    const def = createDefaultGlobalSettings();
    const initialStoredKeys = getStoredGeminiKeys();
    const initialStoredExternal = getStoredExternalConfig();
    const settingsKeys = parseMultiKeysText(
      settings?.aiSettings?.geminiApiKeys || []
    );
    const mergedKeys = Array.from(new Set([...initialStoredKeys, ...settingsKeys]));
    const extCfg = {
      ...def.aiSettings.externalApi,
      ...(settings?.aiSettings?.externalApi || {}),
      ...(initialStoredExternal || {}),
    };
    const activeProvider =
      settings?.aiSettings?.activeProvider ||
      (extCfg.enabled ? "external" : "gemini");

    return {
      ...def,
      ...(settings || {}),
      aiSettings: {
        ...def.aiSettings,
        ...(settings?.aiSettings || {}),
        activeProvider,
        textProvider: activeProvider,
        geminiApiKeys: mergedKeys,
        externalApi: extCfg,
      },
    };
  });

  const [newKeyInput, setNewKeyInput] = useState("");
  const [bulkKeysInput, setBulkKeysInput] = useState(() => {
    const initial =
      local.aiSettings?.geminiApiKeys?.length > 0
        ? local.aiSettings.geminiApiKeys
        : getStoredGeminiKeys();
    return initial.join("\n");
  });

  const [activeScriptId, setActiveScriptId] = useState(
    () => settings?.scriptPresets?.[0]?.id || "documentary"
  );
  const [activeVisualId, setActiveVisualId] = useState(
    () => settings?.visualPresets?.[0]?.id || "cinematic_realistic"
  );
  const [savedNotice, setSavedNotice] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showExternalKey, setShowExternalKey] = useState(false);

  const [providerStatus, setProviderStatus] = useState({
    geminiConfigured: true,
    geminiKeyCount: 0,
    testing: false,
    testMessage: null,
    testOk: false,
    keyStatuses: [],
  });

  const [externalTestStatus, setExternalTestStatus] = useState({
    testing: false,
    tested: false,
    ok: false,
    message: null,
    latencyMs: null,
  });

  const [discoveredModels, setDiscoveredModels] = useState(() => GEMINI_TEXT_MODELS);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsNotice, setFetchModelsNotice] = useState(null);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [keyPoolData, setKeyPoolData] = useState(null);
  const [activeAccountData, setActiveAccountData] = useState(null);
  const [syncingPool, setSyncingPool] = useState(false);

  const currentKeys = parseMultiKeysText(bulkKeysInput);

  const loadAccountAndPool = async () => {
    try {
      const data = await fetchAccountStatus();
      if (data?.ok) {
        if (data.keyPool) setKeyPoolData(data.keyPool);
        if (data.activeGoogleAccount) setActiveAccountData(data.activeGoogleAccount);
        if (data.keyPool?.totalKeys) {
          setProviderStatus((prev) => ({
            ...prev,
            geminiConfigured: true,
            geminiKeyCount: data.keyPool.totalKeys,
          }));
        }
      }
    } catch {}
  };

  useEffect(() => {
    const stored = getStoredGeminiKeys();
    fetchProviderStatus().then((st) => {
      if (st) {
        const count = Math.max(Number(st.geminiKeyCount) || 0, stored.length);
        if (st.keyPool) setKeyPoolData(st.keyPool);
        if (st.activeGoogleAccount) setActiveAccountData(st.activeGoogleAccount);
        setProviderStatus((prev) => ({
          ...prev,
          geminiConfigured: !!(st.geminiConfigured || count > 0),
          geminiKeyCount: count,
        }));
      }
    });

    loadAccountAndPool();
    const interval = setInterval(loadAccountAndPool, 5000);

    // Auto-fetch available models in the background
    fetchAvailableGeminiModels().then((res) => {
      if (Array.isArray(res?.models) && res.models.length > 0) {
        setDiscoveredModels(res.models);
      }
    }).catch(() => {});

    return () => clearInterval(interval);
  }, []);

  const handleSyncAndResetCooldowns = async () => {
    setSyncingPool(true);
    try {
      const res = await syncAccountStatus();
      if (res?.ok) {
        if (res.keyPool) setKeyPoolData(res.keyPool);
        if (res.activeGoogleAccount) setActiveAccountData(res.activeGoogleAccount);
        setProviderStatus((p) => ({
          ...p,
          testOk: true,
          testMessage: isAr
            ? "تمت إعادة ضبط فترات التهدئة ومزامنة جميع المفاتيح وحساب Google النشط بنجاح!"
            : "Successfully reset key cooldowns and synchronized all Gemini API keys!",
        }));
      }
    } catch (err) {
      setProviderStatus((p) => ({
        ...p,
        testOk: false,
        testMessage: err.message || String(err),
      }));
    } finally {
      setSyncingPool(false);
    }
  };

  const handleFetchAvailableModels = async () => {
    setFetchingModels(true);
    setFetchModelsNotice(null);
    try {
      const cleanKeys = parseMultiKeysText(bulkKeysInput);
      const res = await fetchAvailableGeminiModels(cleanKeys);
      if (Array.isArray(res?.models) && res.models.length > 0) {
        setDiscoveredModels(res.models);
        setFetchModelsNotice({
          ok: true,
          msg: isAr
            ? `تم بنجاح جلب وتحديث ${res.models.length} موديلاً متاحاً في حسابك من Google Gemini API!`
            : `Successfully fetched ${res.models.length} available models from Google Gemini API!`,
        });
      } else {
        setFetchModelsNotice({
          ok: false,
          msg: isAr
            ? "تعذر استكشاف الموديلات الحية، تم الإبقاء على قائمة الموديلات القياسية الشاملة."
            : "Could not fetch dynamic models. Using standard model catalogue.",
        });
      }
    } catch (err) {
      setFetchModelsNotice({
        ok: false,
        msg: err.message || (isAr ? "فشل الاتصال بـ Google API لجلب الموديلات." : "Failed to fetch models."),
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const syncKeysList = (nextKeysArray) => {
    const deduped = Array.from(new Set(parseMultiKeysText(nextKeysArray)));
    setBulkKeysInput(deduped.join("\n"));
    setStoredGeminiKeys(deduped);
    setLocal((prev) => ({
      ...prev,
      aiSettings: {
        ...prev.aiSettings,
        geminiApiKeys: deduped,
      },
    }));
  };

  const handleSetActiveProvider = (provider) => {
    setLocal((prev) => {
      const isExt = provider === "external";
      const nextExt = {
        ...prev.aiSettings.externalApi,
        enabled: isExt,
      };
      setStoredExternalConfig(nextExt);
      updateServerExternalConfig(nextExt).catch(() => {});
      return {
        ...prev,
        aiSettings: {
          ...prev.aiSettings,
          activeProvider: provider,
          textProvider: provider,
          externalApi: nextExt,
        },
      };
    });
  };

  const handleUpdateExternalField = (field, val) => {
    setLocal((prev) => {
      const nextExt = {
        ...prev.aiSettings.externalApi,
        [field]: val,
      };
      setStoredExternalConfig(nextExt);
      return {
        ...prev,
        aiSettings: {
          ...prev.aiSettings,
          externalApi: nextExt,
        },
      };
    });
  };

  const EXTERNAL_PRESETS = [
    {
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      desc: "gpt-4o-mini",
    },
    {
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      desc: "deepseek-chat",
    },
    {
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "meta-llama/llama-3.3-70b-instruct",
      desc: "Llama-3.3-70B",
    },
    {
      name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
      desc: "Ultra-Fast",
    },
    {
      name: "Ollama (Local)",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.2",
      desc: "Local / 11434",
    },
  ];

  const handleApplyExternalPreset = (preset) => {
    setLocal((prev) => {
      const nextExt = {
        ...prev.aiSettings.externalApi,
        baseUrl: preset.baseUrl,
        model: preset.model,
      };
      setStoredExternalConfig(nextExt);
      return {
        ...prev,
        aiSettings: {
          ...prev.aiSettings,
          externalApi: nextExt,
        },
      };
    });
  };

  const handleTestExternalApi = async () => {
    const ext = local.aiSettings.externalApi || {};
    if (!ext.apiKey?.trim()) {
      setExternalTestStatus({
        testing: false,
        tested: true,
        ok: false,
        message: isAr
          ? "يرجى كتابة مفتاح API أولاً (API Key)."
          : "Please enter your External API Key first.",
        latencyMs: null,
      });
      return;
    }
    setExternalTestStatus({
      testing: true,
      tested: false,
      ok: false,
      message: isAr ? "جاري فحص الاتصال بالـ API الخارجي..." : "Testing connection...",
      latencyMs: null,
    });
    try {
      const res = await testExternalApiConnection({
        apiKey: ext.apiKey.trim(),
        baseUrl: ext.baseUrl?.trim() || "https://api.openai.com/v1",
        model: ext.model?.trim() || "gpt-4o-mini",
      });
      setExternalTestStatus({
        testing: false,
        tested: true,
        ok: true,
        message: isAr
          ? `تم الاتصال بنجاح! المودل: ${res.model} — سرعة الاستجابة: ${res.latencyMs || 0}ms`
          : `Connected successfully! Model: ${res.model} — Latency: ${res.latencyMs || 0}ms`,
        latencyMs: res.latencyMs,
      });
    } catch (err) {
      setExternalTestStatus({
        testing: false,
        tested: true,
        ok: false,
        message: err.message || String(err),
        latencyMs: null,
      });
    }
  };

  const handleAddSingleOrPasteKeys = () => {
    const added = parseMultiKeysText(newKeyInput);
    if (!added.length) return;
    const combined = Array.from(new Set([...currentKeys, ...added]));
    syncKeysList(combined);
    setNewKeyInput("");
  };

  const handleRemoveKeyAt = (idxToRemove) => {
    const next = currentKeys.filter((_, idx) => idx !== idxToRemove);
    syncKeysList(next);
  };

  const handleClearAllKeys = async () => {
    const ok = await showConfirm(
      isAr
        ? "هل تريد مسح جميع مفاتيح Gemini المدخلة في الواجهة؟"
        : "Clear all entered Gemini API keys from Settings?",
      { danger: true, okText: isAr ? "مسح الكل" : "Clear All" }
    );
    if (!ok) return;
    syncKeysList([]);
  };

  const handleSave = async () => {
    const cleanKeys = parseMultiKeysText(bulkKeysInput);
    setStoredGeminiKeys(cleanKeys);
    const extCfg = local.aiSettings?.externalApi || {};
    setStoredExternalConfig(extCfg);

    const updatedSettings = {
      ...local,
      aiSettings: {
        ...local.aiSettings,
        textProvider: local.aiSettings.activeProvider,
        geminiApiKeys: cleanKeys,
        externalApi: extCfg,
      },
    };
    setLocal(updatedSettings);

    try {
      await updateServerGeminiConfig({
        apiKeys: cleanKeys,
        textModel: updatedSettings.aiSettings.textModel || "gemini-3.8-flash",
        imageModel: updatedSettings.aiSettings.imageModel || "gemini-3.1-flash-lite-image",
        ttsModel: updatedSettings.aiSettings.ttsModel || "gemini-3.8-flash-lite-tts",
        ttsVoice: updatedSettings.aiSettings.ttsVoice || "Charon",
      });
      await updateServerExternalConfig(extCfg);
    } catch (_) {}

    await onSaveSettings(updatedSettings);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleTestGeminiKeys = async () => {
    const cleanKeys = parseMultiKeysText(bulkKeysInput);
    setStoredGeminiKeys(cleanKeys);
    setProviderStatus((p) => ({ ...p, testing: true, testMessage: null, keyStatuses: [] }));
    try {
      const res = await updateServerGeminiConfig({
        apiKeys: cleanKeys,
        textModel: local.aiSettings?.textModel || "gemini-3.8-flash",
        imageModel: local.aiSettings?.imageModel || "gemini-3.1-flash-lite-image",
        ttsModel: local.aiSettings?.ttsModel || "gemini-3.8-flash-lite-tts",
        ttsVoice: local.aiSettings?.ttsVoice || "Charon",
        testConnection: true,
      });
      await onSaveSettings({
        ...local,
        aiSettings: {
          ...local.aiSettings,
          geminiApiKeys: cleanKeys,
        },
      });
      const workingCount = Number(res.workingCount ?? res.keyCount ?? cleanKeys.length);
      const totalCount = Number(res.keyCount ?? cleanKeys.length);
      setProviderStatus((p) => ({
        ...p,
        testing: false,
        geminiConfigured: totalCount > 0,
        geminiKeyCount: totalCount,
        keyStatuses: res.keyStatuses || [],
        testOk: workingCount > 0,
        testMessage: isAr
          ? `تم فحص المفاتيح بنجاح: ${workingCount} من أصل ${totalCount} مفتاح Gemini يعمل وجاهز للتوليد السريع والتبديل التلقائي!`
          : `Verified Gemini keys: ${workingCount} of ${totalCount} key(s) active and ready for high-speed parallel generation & auto-failover!`,
      }));
    } catch (err) {
      setProviderStatus((p) => ({
        ...p,
        testing: false,
        testOk: false,
        testMessage: err.message || String(err),
      }));
    }
  };

  const resetDefaults = async () => {
    const ok = await showConfirm(
      isAr
        ? "استعادة كافة إعدادات الإنتاج الافتراضية؟"
        : "Reset all production presets to factory defaults?",
      { okText: isAr ? "استعادة" : "Reset" }
    );
    if (!ok) return;
    const def = createDefaultGlobalSettings();
    const keptKeys = getStoredGeminiKeys();
    def.aiSettings.geminiApiKeys = keptKeys;
    setLocal(def);
    setActiveScriptId(def.scriptPresets[0].id);
    setActiveVisualId(def.visualPresets[0].id);
    await onSaveSettings(def);
  };

  return (
    <div className="uyns-settings" dir={isAr ? "rtl" : "ltr"}>
      <div className="uyns-settings__header">
        <div>
          <h1 className="uyns-settings__title">
            {isAr
              ? "إعدادات مفاتيح Gemini API المتعددة والتوليد فائق السرعة"
              : "Settings — Multi-Key Gemini API Pool & Ultra-Fast Generation"}
          </h1>
          <p className="uyns-settings__subtitle">
            {isAr
              ? "أدخل مفتاح Gemini API واحد أو عدة مفاتيح. عند توقف أو انتهاء حصة أي مفتاح ينتقل النظام فوراً للمفتاح الثاني بدون توقف، مع توزيع الطلبات بالتوازي لسرعة قصوى."
              : "Add multiple Gemini API keys. When a key hits quota or fails, the engine automatically switches to the next key and distributes batch generation in parallel for maximum speed."}
          </p>
        </div>
        <div className="uyns-settings__actions">
          <button type="button" className="uyns-btn uyns-btn--ghost" onClick={resetDefaults}>
            <RotateCcw className="w-4 h-4" />
            <span>{isAr ? "استعادة الافتراضي" : "Reset Defaults"}</span>
          </button>
          <button type="button" className="uyns-btn uyns-btn--primary" onClick={handleSave}>
            <Check className="w-4 h-4" />
            <span>
              {savedNotice
                ? isAr
                  ? "تم الحفظ وتفعيل المفاتيح"
                  : "Keys & Settings Saved"
                : isAr
                ? "حفظ وتفعيل المفاتيح"
                : "Save Keys & Settings"}
            </span>
          </button>
        </div>
      </div>

      <div className="uyns-settings__grid">
        {/* Primary AI Provider Switcher (Gemini vs External API) */}
        <section className="uyns-card border-[var(--line-glow)] bg-[var(--panel-2)]/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sliders className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-xs uppercase font-bold tracking-wider text-[var(--accent)]">
                  {isAr ? "اختيار المزود النشط للذكاء الاصطناعي" : "Active AI Engine Selection"}
                </span>
              </div>
              <h2 className="text-base font-bold text-[var(--fg)]">
                {local.aiSettings?.activeProvider === "external"
                  ? isAr
                    ? "المزود النشط حالياً: API خارجي مخصص (OpenAI-Compatible)"
                    : "Currently Active: External Custom API (OpenAI-Compatible)"
                  : isAr
                  ? "المزود النشط حالياً: Google Gemini (مجموعة مفاتيح متعددة)"
                  : "Currently Active: Google Gemini (Multi-Key Pool)"}
              </h2>
              <p className="text-xs text-[var(--muted)] mt-1">
                {isAr
                  ? "يمكنك التبديل بسهولة بين Google Gemini ومزود API خارجي (مثل DeepSeek أو OpenAI أو OpenRouter أو Groq أو Ollama المحلي)."
                  : "Easily switch between Google Gemini and an external custom API provider (DeepSeek, OpenAI, OpenRouter, Groq, local Ollama, etc.)."}
              </p>
            </div>

            <div className="flex items-center gap-2 bg-[var(--bg)] p-1.5 rounded-xl border border-[var(--line)] self-start md:self-center shrink-0">
              <button
                type="button"
                onClick={() => handleSetActiveProvider("gemini")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  local.aiSettings?.activeProvider === "gemini"
                    ? "bg-[var(--accent)] text-black shadow-md scale-[1.02]"
                    : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel)]"
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Google Gemini</span>
                {local.aiSettings?.activeProvider === "gemini" && (
                  <span className="w-2 h-2 rounded-full bg-black/60 animate-pulse ml-1" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSetActiveProvider("external")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  local.aiSettings?.activeProvider === "external"
                    ? "bg-[var(--accent)] text-black shadow-md scale-[1.02]"
                    : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel)]"
                }`}
              >
                <Server className="w-4 h-4" />
                <span>{isAr ? "API خارجي (Custom)" : "External API"}</span>
                {local.aiSettings?.activeProvider === "external" && (
                  <span className="w-2 h-2 rounded-full bg-black/60 animate-pulse ml-1" />
                )}
              </button>
            </div>
          </div>
        </section>

        {/* 2. External / Custom API Configuration Card */}
        <section
          className={`uyns-card transition-all ${
            local.aiSettings?.activeProvider === "external"
              ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/30"
              : "border-[var(--line)] opacity-95"
          }`}
        >
          <div className="uyns-card__head">
            <div className="flex items-center gap-2.5">
              <Server className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="uyns-card__title">
                    {isAr
                      ? "إعدادات الـ API الخارجي (OpenAI-Compatible)"
                      : "External Custom API Settings (OpenAI-Compatible)"}
                  </h2>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                      local.aiSettings?.activeProvider === "external"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-[var(--line-soft)] text-[var(--muted)]"
                    }`}
                  >
                    {local.aiSettings?.activeProvider === "external"
                      ? isAr
                        ? "نشط حالياً ✓"
                        : "Active ✓"
                      : isAr
                      ? "معطل"
                      : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {isAr
                    ? "استخدم أي مزود خارجي يدعم بروتوكول OpenAI (مثل DeepSeek, OpenRouter, Groq, OpenAI, Ollama المحلي). حدد اسم الموديل ورابط الـ API والمفتاح."
                    : "Connect any OpenAI-compatible provider (DeepSeek, OpenRouter, Groq, OpenAI, local Ollama). Specify Model Name, Base URL & API Key."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleSetActiveProvider(
                    local.aiSettings?.activeProvider === "external" ? "gemini" : "external"
                  )
                }
                className={`uyns-btn uyns-btn--sm ${
                  local.aiSettings?.activeProvider === "external"
                    ? "uyns-btn--ghost text-amber-400 border-amber-500/30"
                    : "uyns-btn--primary"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>
                  {local.aiSettings?.activeProvider === "external"
                    ? isAr
                      ? "تعطيل والرجوع لـ Gemini"
                      : "Deactivate & Switch to Gemini"
                    : isAr
                    ? "تفعيل هذا المزود كبديل"
                    : "Activate External API"}
                </span>
              </button>

              <button
                type="button"
                disabled={externalTestStatus.testing}
                onClick={handleTestExternalApi}
                className="uyns-btn uyns-btn--ghost uyns-btn--sm"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${externalTestStatus.testing ? "animate-spin" : ""}`}
                />
                <span>
                  {externalTestStatus.testing
                    ? isAr
                      ? "جاري الفحص..."
                      : "Testing..."
                    : isAr
                    ? "فحص الاتصال"
                    : "Test Connection"}
                </span>
              </button>
            </div>
          </div>

          {/* Test Status Banner */}
          {externalTestStatus.message && (
            <div
              className={`uyns-banner mb-4 ${
                externalTestStatus.ok ? "uyns-banner--busy" : "uyns-banner--error"
              }`}
            >
              <span>{externalTestStatus.message}</span>
            </div>
          )}

          {/* Quick Presets */}
          <div className="mb-4">
            <span className="text-xs font-semibold text-[var(--muted)] block mb-1.5">
              {isAr ? "إعدادات مسبقة سريعة (اضغط للتعبئة التلقائية):" : "Quick Presets (Click to autofill):"}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EXTERNAL_PRESETS.map((p) => {
                const isSelected =
                  local.aiSettings?.externalApi?.baseUrl === p.baseUrl &&
                  local.aiSettings?.externalApi?.model === p.model;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyExternalPreset(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? "bg-[var(--accent)] text-black border-[var(--accent)] font-bold shadow-sm"
                        : "bg-[var(--panel-2)] text-[var(--fg)] border-[var(--line-soft)] hover:border-[var(--line-glow)]"
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className="text-[10px] opacity-75 ml-1.5 font-mono">({p.desc})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inputs Grid */}
          <div className="uyns-form-grid">
            {/* 1. Model Name */}
            <div className="uyns-field">
              <label>
                {isAr ? "اسم المودل (Model Name)" : "Model Name"}
                <span className="text-[var(--accent)] text-xs font-mono ml-1.5">
                  (e.g. deepseek-chat, gpt-4o-mini)
                </span>
              </label>
              <input
                type="text"
                value={local.aiSettings?.externalApi?.model || ""}
                onChange={(e) => handleUpdateExternalField("model", e.target.value)}
                placeholder="gpt-4o-mini"
                className="font-mono text-xs"
              />
            </div>

            {/* 2. Base URL */}
            <div className="uyns-field">
              <label>
                {isAr ? "رابط الـ API الأساسي (Base URL / Endpoint)" : "API Base URL / Endpoint"}
                <span className="text-[var(--accent)] text-xs font-mono ml-1.5">
                  (e.g. https://api.openai.com/v1)
                </span>
              </label>
              <input
                type="text"
                value={local.aiSettings?.externalApi?.baseUrl || ""}
                onChange={(e) => handleUpdateExternalField("baseUrl", e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="font-mono text-xs"
              />
            </div>

            {/* 3. API Key */}
            <div className="uyns-field uyns-field--full">
              <label className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{isAr ? "مفتاح الـ API الخارجي (API Key)" : "External API Key"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowExternalKey((v) => !v)}
                  className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                >
                  {showExternalKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showExternalKey ? (isAr ? "إخفاء" : "Hide") : (isAr ? "إظهار" : "Show")}</span>
                </button>
              </label>
              <input
                type={showExternalKey ? "text" : "password"}
                value={local.aiSettings?.externalApi?.apiKey || ""}
                onChange={(e) => handleUpdateExternalField("apiKey", e.target.value)}
                placeholder={
                  isAr
                    ? "الصق مفتاح الـ API الخاص بالمزود الخارجي هنا (sk-...)"
                    : "Paste your external provider's API key here (sk-...)"
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
          </div>
        </section>

        {/* 3. Multi-Key Gemini API Manager */}
        <section
          className={`uyns-card transition-all ${
            local.aiSettings?.activeProvider === "gemini"
              ? "border-[var(--line-glow)] ring-1 ring-[var(--accent)]/30"
              : "border-[var(--line)] opacity-95"
          }`}
        >
          <div className="uyns-card__head">
            <div className="flex items-center gap-2.5">
              <Zap className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="uyns-card__title">
                    {isAr
                      ? "Google Gemini — محرك النصوص والتفكير السينمائي (Text & Reasoning Only)"
                      : "Google Gemini — Text & Reasoning Studio Engine"}
                  </h2>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                      local.aiSettings?.activeProvider === "gemini"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-[var(--line-soft)] text-[var(--muted)]"
                    }`}
                  >
                    {local.aiSettings?.activeProvider === "gemini"
                      ? isAr
                        ? "نشط حالياً ✓"
                        : "Active ✓"
                      : isAr
                      ? "معطل"
                      : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {isAr
                    ? "توزيع متوازن للأحمال وتنفيذ متوازي عبر كافة المفاتيح. مخصص حصرياً للتحليل، التفكير، كتابة السيناريو، وتقسيم المشاهد (تم إلغاء توليد الصور والصوت عبر جمناي)."
                    : "Multi-key pool dedicated exclusively to narrative analysis, concepts, scriptwriting, scene breakdowns, and prompt engineering."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleSetActiveProvider(
                    local.aiSettings?.activeProvider === "gemini" ? "external" : "gemini"
                  )
                }
                className={`uyns-btn uyns-btn--sm ${
                  local.aiSettings?.activeProvider === "gemini"
                    ? "uyns-btn--ghost text-amber-400 border-amber-500/30"
                    : "uyns-btn--primary"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {local.aiSettings?.activeProvider === "gemini"
                    ? isAr
                      ? "تعطيل والتبديل للخارجي"
                      : "Switch to External API"
                    : isAr
                    ? "تفعيل Google Gemini"
                    : "Activate Google Gemini"}
                </span>
              </button>

              <span
                className={`text-xs font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                  currentKeys.length > 0 || providerStatus.geminiConfigured
                    ? "text-[var(--accent)] border-[var(--line-glow)] bg-[var(--panel-2)]"
                    : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                }`}
              >
                {currentKeys.length > 0 || providerStatus.geminiConfigured ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {isAr
                        ? `مفاتيح Gemini النشطة: ${Math.max(
                            currentKeys.length,
                            providerStatus.geminiKeyCount || 0
                          )}`
                        : `Active Gemini Keys: ${Math.max(
                            currentKeys.length,
                            providerStatus.geminiKeyCount || 0
                          )}`}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>
                      {isAr ? "أضف مفتاح Gemini واحد على الأقل" : "Add at least 1 Gemini key"}
                    </span>
                  </>
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={syncingPool}
                  onClick={handleSyncAndResetCooldowns}
                  className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                  title={isAr ? "إلغاء فترات التهدئة ومزامنة جميع المفاتيح" : "Reset cooldowns and sync keys"}
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${syncingPool ? "animate-spin" : ""}`} />
                  <span>
                    {syncingPool
                      ? isAr
                        ? "جاري المزامنة..."
                        : "Syncing..."
                      : isAr
                      ? "تصفير التهدئة ومزامنة المفاتيح"
                      : "Reset Cooldowns"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={providerStatus.testing}
                  onClick={handleTestGeminiKeys}
                  className="uyns-btn uyns-btn--primary uyns-btn--sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${providerStatus.testing ? "animate-spin" : ""}`} />
                  <span>
                    {providerStatus.testing
                      ? isAr
                        ? "جاري فحص جميع المفاتيح..."
                        : "Testing All Keys..."
                      : isAr
                      ? "فحص وحفظ جميع المفاتيح"
                      : "Test & Verify All Keys"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Multi-API Key Rotation & Resilience Live Dashboard */}
          <div className="mt-3 p-4 rounded-xl bg-[var(--panel-2)] border border-[var(--line-soft)] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-white">
                  {isAr
                    ? "نظام تدوير المفاتيح المتعددة والتعافي التلقائي (Multi-Key Rotation Pool)"
                    : "Multi-API Key Rotation Pool & Auto-Failover"}
                </span>
              </div>
              <span className="text-[11px] text-[var(--muted)]">
                {isAr
                  ? `الحساب: ${activeAccountData?.userEmail || "Google AI Studio Active Session"}`
                  : `Account: ${activeAccountData?.userEmail || "Google AI Studio Active Session"}`}
              </span>
            </div>

            {/* Metric Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-lg bg-[var(--panel-1)] border border-[var(--line-soft)] text-center">
                <div className="text-[10px] text-[var(--muted)]">{isAr ? "إجمالي المفاتيح" : "Total Keys"}</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {keyPoolData?.totalKeys || currentKeys.length || 1}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--panel-1)] border border-[var(--line-soft)] text-center">
                <div className="text-[10px] text-[var(--muted)]">{isAr ? "مفاتيح جاهزة للعمل" : "Active & Ready"}</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {keyPoolData?.activeCount ?? currentKeys.length ?? 1}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--panel-1)] border border-[var(--line-soft)] text-center">
                <div className="text-[10px] text-[var(--muted)]">{isAr ? "في فترة تهدئة (429)" : "In Cooldown (429)"}</div>
                <div className={`text-base font-bold mt-0.5 ${keyPoolData?.cooldownCount ? "text-amber-400" : "text-[var(--muted)]"}`}>
                  {keyPoolData?.cooldownCount ?? 0}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--panel-1)] border border-[var(--line-soft)] text-center">
                <div className="text-[10px] text-[var(--muted)]">{isAr ? "المفتاح النشط حالياً" : "Current Active Key"}</div>
                <div className="text-base font-bold text-[var(--accent)] mt-0.5">
                  #{keyPoolData?.currentCursor || 1}
                </div>
              </div>
            </div>

            {/* Architecture Explanations Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-[var(--muted)] pt-1">
              <div className="p-2.5 rounded-lg bg-[var(--panel-1)]/60 border border-[var(--line-soft)]/50">
                <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-[10px] font-bold flex items-center justify-center">1</span>
                  <span>{isAr ? "مصفوفة المفاتيح (Key Pool)" : "API Key Pool"}</span>
                </div>
                <p className="leading-relaxed">
                  {isAr
                    ? "يستقبل النظام مصفوفة مفاتيح عبر متغير البيئة GEMINI_API_KEYS أو إعدادات الواجهة مع حفظ مؤشر دائري (Round-Robin) لاختيار المفتاح النشط."
                    : "Accepts a list of keys via GEMINI_API_KEYS or UI settings with a round-robin cursor for active key selection."}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--panel-1)]/60 border border-[var(--line-soft)]/50">
                <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center">2</span>
                  <span>{isAr ? "التدوير الفوري والتهدئة (Failover)" : "Failover & Cooldown"}</span>
                </div>
                <p className="leading-relaxed">
                  {isAr
                    ? "عند حدوث خطأ نفاد الحصة (429 Quota Exhausted)، ينتقل تلقائياً وفوراً للمفتاح الموالي ويعيد المحاولة مع وضع المفتاح السابق في تهدئة مؤقتة (60s)."
                    : "On quota limits (429 / Resource Exhausted), immediately rotates to next key and applies a temporary 60s cooldown."}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--panel-1)]/60 border border-[var(--line-soft)]/50">
                <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold flex items-center justify-center">3</span>
                  <span>{isAr ? "سلسلة النماذج (Model Cascade)" : "Model Fallback Cascade"}</span>
                </div>
                <p className="leading-relaxed">
                  {isAr
                    ? "إذا نفدت حصة جميع المفاتيح للنموذج الحالي، ينتقل النظام تلقائياً للنموذج التالي في السلسلة (Gemini 3.8 Flash → 3.1 Lite → Latest)."
                    : "If all keys are exhausted for a model, the engine cascades seamlessly to the next compatible model in chain."}
                </p>
              </div>
            </div>
          </div>

          {/* Banner confirming Text & Reasoning Only */}
          <div className="mt-3 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-cyan-300">
                {isAr
                  ? "مخصص حصرياً للنصوص والتفكير والاستنتاج (Text & Reasoning Only):"
                  : "Dedicated to Text & Reasoning Only:"}
              </span>
              <p className="text-[var(--muted)] leading-relaxed">
                {isAr
                  ? "يستفيد الاستوديو من كامل عائلة موديلات Gemini في: تحليل الفيديوهات المرجعية، استنباط 5 أفكار إبداعية، صياغة السيناريو، تقسيم المشاهد وتوقيتاتها، وهندسة الأوامر البصرية والحركية والسيو. تم إلغاء توليد الصور والصوت عبر جمناي لضمان أقصى سرعة وتفادي أي تعليق."
                  : "Gemini is leveraged exclusively for reference video analysis, 5 creative concepts, scriptwriting, timed scene breakdown, and prompt/SEO engineering. Image and voice generation via Gemini are disabled."}
              </p>
            </div>
          </div>

          {providerStatus.testMessage && (
            <div
              className={`uyns-banner mb-4 ${
                providerStatus.testOk ? "uyns-banner--busy" : "uyns-banner--error"
              }`}
            >
              <span>{providerStatus.testMessage}</span>
            </div>
          )}

          {/* Quick Add Key Input */}
          <div className="uyns-form-grid mb-4">
            <div className="uyns-field uyns-field--full">
              <label className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>
                    {isAr
                      ? "إضافة مفتاح Gemini API جديد (أو لصق عدة مفاتيح دفعة واحدة)"
                      : "Add New Gemini API Key (or paste multiple keys at once)"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowApiKeys((v) => !v)}
                  className="uyns-btn uyns-btn--ghost uyns-btn--sm"
                >
                  {showApiKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>
                    {showApiKeys
                      ? isAr
                        ? "إخفاء المفاتيح"
                        : "Hide Keys"
                      : isAr
                      ? "إظهار المفاتيح"
                      : "Show Keys"}
                  </span>
                </button>
              </label>

              <div className="flex items-center gap-2">
                <input
                  type={showApiKeys ? "text" : "password"}
                  value={newKeyInput}
                  onChange={(e) => setNewKeyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSingleOrPasteKeys();
                    }
                  }}
                  placeholder={
                    isAr
                      ? "الصق مفتاح Gemini هنا (AIzaSy...) ثم اضغط إضافة — يمكنك إضافة عدد غير محدود من المفاتيح"
                      : "Paste Gemini API key (AIzaSy...) and click Add — supports unlimited keys"
                  }
                  className="flex-1 font-mono text-xs"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleAddSingleOrPasteKeys}
                  className="uyns-btn uyns-btn--primary uyns-btn--sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAr ? "إضافة للمجموعة" : "Add Key"}</span>
                </button>
              </div>
            </div>

            {/* Multi-line Bulk Keys Textarea */}
            <div className="uyns-field uyns-field--full">
              <label className="flex items-center justify-between">
                <span>
                  {isAr
                    ? `قائمة مفاتيح Gemini API (${currentKeys.length} مفتاح حالياً — ضع كل مفتاح في سطر أو افصل بينها بفاصلة)`
                    : `Gemini API Keys Pool (${currentKeys.length} key(s) — one key per line or comma-separated)`}
                </span>
                {currentKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllKeys}
                    className="text-xs text-[var(--bad)] hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{isAr ? "مسح الكل" : "Clear All"}</span>
                  </button>
                )}
              </label>
              <textarea
                rows={4}
                value={bulkKeysInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setBulkKeysInput(val);
                  const parsed = parseMultiKeysText(val);
                  setStoredGeminiKeys(parsed);
                  setLocal((prev) => ({
                    ...prev,
                    aiSettings: {
                      ...prev.aiSettings,
                      geminiApiKeys: parsed,
                    },
                  }));
                }}
                placeholder={
                  isAr
                    ? "AIzaSyKey1...\nAIzaSyKey2...\nAIzaSyKey3..."
                    : "AIzaSyKey1...\nAIzaSyKey2...\nAIzaSyKey3..."
                }
                className="font-mono text-xs leading-relaxed"
                style={{
                  WebkitTextSecurity: showApiKeys ? "none" : "disc",
                }}
              />
              <span className="text-[11px] text-[var(--muted)] mt-1 block leading-relaxed">
                {isAr
                  ? "⚡ نظام التدوير التلقائي الذاتي: يقوم النظام بالتدوير التلقائي المتوازن بين جميع المفاتيح المضافة هنا على كل طلب بدون أي تدخل منك نهائياً. وإذا وصل أي مفتاح لحد الحصة (Quota 429) أو واجه أي عائق، يتم التحويل فوراً وسراً للمفتاح التالي في الحوض لضمان عدم توقف العمل."
                  : "⚡ Autonomous Round-Robin Rotation: The system automatically and continuously rotates between all added keys on every request with zero manual intervention required, instantly falling over to the next key if any key hits quota limits."}
              </span>
            </div>
          </div>

          {/* Individual Key Cards with Order & Live Pool Status */}
          {currentKeys.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
                <span>
                  {isAr
                    ? "ترتيب وحالة المفاتيح في المصفوفة (الأولوية ومؤشر التدوير):"
                    : "Key Pool Priority & Active Rotation Status:"}
                </span>
                <span className="text-[11px] text-[var(--accent)]">
                  {isAr
                    ? `المفتاح النشط في الدور: #${keyPoolData?.currentCursor || 1}`
                    : `Active in queue: #${keyPoolData?.currentCursor || 1}`}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {currentKeys.map((k, idx) => {
                  const masked = showApiKeys
                    ? k
                    : `${k.slice(0, 8)}••••••••••••••••${k.slice(-4)}`;
                  const st = providerStatus.keyStatuses.find((s) => s.index === idx + 1);
                  const poolKey = keyPoolData?.keys?.find((pk) => pk.index === idx + 1);
                  const isCursor = (keyPoolData?.currentCursor || 1) === idx + 1;
                  const inCooldown = poolKey?.inCooldown;

                  return (
                    <div
                      key={`${k.slice(0, 10)}_${idx}`}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs transition-all ${
                        isCursor
                          ? "bg-[var(--accent)]/10 border-2 border-[var(--accent)] shadow-sm"
                          : inCooldown
                          ? "bg-amber-500/10 border border-amber-500/30"
                          : "bg-[var(--panel-2)] border border-[var(--line-soft)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold shrink-0 ${
                            isCursor
                              ? "bg-[var(--accent)] text-white"
                              : "bg-[var(--panel-1)] text-[var(--accent)]"
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <span className="font-mono truncate">{masked}</span>

                        {isCursor && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)] text-[10px] font-bold shrink-0">
                            {isAr ? "⚡ النشط حالياً" : "Active Cursor"}
                          </span>
                        )}

                        {poolKey?.isDeniedOrInvalid || st?.isDenied ? (
                          <span
                            className="text-[11px] font-semibold text-rose-400 shrink-0 flex items-center gap-1"
                            title={st?.error || (isAr ? "تم حظر هذا المشروع / المفتاح من Google" : "Project access denied by Google")}
                          >
                            <span>🚫</span>
                            <span>{isAr ? "مرفوض (403 Denied)" : "Denied (403)"}</span>
                          </span>
                        ) : inCooldown ? (
                          <span className="text-[11px] font-semibold text-amber-400 shrink-0 flex items-center gap-1">
                            <span>⏳</span>
                            <span>
                              {isAr
                                ? `تهدئة (${poolKey.remainingCooldownSec} ث)`
                                : `Cooldown (${poolKey.remainingCooldownSec}s)`}
                            </span>
                          </span>
                        ) : st ? (
                          <span
                            className={`text-[11px] font-semibold shrink-0 ${
                              st.ok ? "text-emerald-400" : "text-red-400"
                            }`}
                            title={st.error || ""}
                          >
                            {st.ok ? (isAr ? "يعمل ✓" : "Active ✓") : isAr ? "خطأ/حصة ✗" : "Quota/Err ✗"}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-emerald-400 shrink-0">
                            {isAr ? "جاهز للعمل ✓" : "Ready ✓"}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyAt(idx)}
                        className="text-[var(--muted)] hover:text-[var(--bad)] p-1 shrink-0"
                        title={isAr ? "حذف هذا المفتاح" : "Remove Key"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* High-Speed Gemini Text & Reasoning Models Selection */}
          <div className="pt-4 border-t border-[var(--line-soft)] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <label className="text-sm font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                  <span>
                    {isAr
                      ? "موديل Gemini للنصوص والتفكير والاستنتاج (Text & Reasoning Model)"
                      : "Gemini Text & Reasoning Model"}
                  </span>
                </label>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {isAr
                    ? "اختر أي موديل من عائلة Gemini المتاحة (Gemini 3 Pro, Flash, Lite, 2.5 Pro, Flash، أو أحدث إصدار تلقائياً)"
                    : "Select any model from the Gemini family (Gemini 3 Pro, Flash, Lite, 2.5 Pro, Flash, or latest alias)"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFetchAvailableModels}
                  disabled={fetchingModels}
                  className="uyns-btn uyns-btn--ghost uyns-btn--sm text-xs"
                  title={isAr ? "فحص الموديلات المتاحة في حسابك عبر API" : "Fetch available models from API"}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? "animate-spin text-[var(--accent)]" : ""}`} />
                  <span>
                    {fetchingModels
                      ? isAr
                        ? "جاري جلب الموديلات..."
                        : "Fetching Models..."
                      : isAr
                      ? "تحديث الموديلات المتاحة (API)"
                      : "Fetch Available Models"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCustomModel((v) => !v)}
                  className="uyns-btn uyns-btn--ghost uyns-btn--sm text-xs"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>
                    {isCustomModel
                      ? isAr
                        ? "القائمة المعتمدة"
                        : "Dropdown List"
                      : isAr
                      ? "كتابة موديل يدوي"
                      : "Custom Model ID"}
                  </span>
                </button>
              </div>
            </div>

            {fetchModelsNotice && (
              <div
                className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                  fetchModelsNotice.ok
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                    : "bg-amber-500/10 border border-amber-500/30 text-amber-300"
                }`}
              >
                {fetchModelsNotice.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                <span>{fetchModelsNotice.msg}</span>
              </div>
            )}

            {isCustomModel ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={local.aiSettings?.textModel || "gemini-3.8-flash"}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setLocal((p) => ({
                      ...p,
                      aiSettings: { ...p.aiSettings, textModel: val },
                    }));
                    setStoredGeminiTextModel(val);
                  }}
                  placeholder="e.g. gemini-3.8-flash, gemini-3.1-pro-preview, gemini-4-argon..."
                  className="w-full font-mono text-sm"
                />
                <p className="text-[11px] text-[var(--muted)]">
                  {isAr
                    ? "يمكنك إدخال أي معرف موديل مفعل في مشروعك على Google AI Studio."
                    : "Enter any valid model ID supported by your Google AI Studio project."}
                </p>
              </div>
            ) : (
              <select
                value={local.aiSettings?.textModel || "gemini-3.8-flash"}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocal((p) => ({
                    ...p,
                    aiSettings: { ...p.aiSettings, textModel: val },
                  }));
                  setStoredGeminiTextModel(val);
                }}
                className="w-full font-medium"
              >
                {Object.entries(
                  discoveredModels.reduce((acc, m) => {
                    const cat =
                      m.category ||
                      (m.id.startsWith("gemini-3")
                        ? "Gemini 3 Series"
                        : m.id.startsWith("gemini-2.5")
                        ? "Gemini 2.5 Series"
                        : "Other Gemini Models");
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(m);
                    return acc;
                  }, {})
                ).map(([categoryName, modelsList]) => (
                  <optgroup key={categoryName} label={categoryName}>
                    {modelsList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName || m.label || m.id} {m.description ? `— ${m.description}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}

            {/* Selected Model Details Card */}
            {(() => {
              const activeId = local.aiSettings?.textModel || "gemini-3.8-flash";
              const currentModelObj = discoveredModels.find((m) => m.id === activeId);
              return (
                <div className="p-2.5 rounded-lg bg-[var(--panel-2)] border border-[var(--line-soft)] text-xs flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-cyan-300 font-bold">{activeId}</span>
                    {currentModelObj?.category && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--elev)] text-[var(--muted)] border border-[var(--line-soft)]">
                        {currentModelObj.category}
                      </span>
                    )}
                    {currentModelObj?.isRecommended && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {isAr ? "موصى به للسرعة والتكلفة" : "Recommended for Speed"}
                      </span>
                    )}
                  </div>
                  {currentModelObj?.inputTokenLimit && (
                    <span className="text-[11px] text-[var(--muted)] font-mono">
                      Context: {Math.round(currentModelObj.inputTokenLimit / 1000)}k tokens
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </section>

        {/* Language Toggle & Theme */}
        <section className="uyns-card">
          <div className="uyns-card__head">
            <h2 className="uyns-card__title">
              {isAr ? "لغة الواجهة والمظهر" : "Language Toggle & Theme"}
            </h2>
          </div>

          <div className="uyns-form-grid">
            <div className="uyns-field">
              <label>{isAr ? "لغة واجهة الاستوديو" : "Interface Language (EN / عربي)"}</label>
              <div className="uyns-segmented">
                <button
                  type="button"
                  onClick={() => setUiLang("en")}
                  className={`uyns-segmented__btn ${uiLang === "en" ? "is-active" : ""}`}
                >
                  <Globe className="w-4 h-4" />
                  <span>EN · English</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUiLang("ar")}
                  className={`uyns-segmented__btn ${uiLang === "ar" ? "is-active" : ""}`}
                >
                  <Globe className="w-4 h-4" />
                  <span>عربي · Arabic (RTL)</span>
                </button>
              </div>
            </div>

            <div className="uyns-field">
              <label>{isAr ? "المظهر اللوني" : "Workspace Theme"}</label>
              <div className="uyns-segmented">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`uyns-segmented__btn ${theme === "light" ? "is-active" : ""}`}
                >
                  <Sun className="w-4 h-4" />
                  <span>{isAr ? "نهاري (Light)" : "Light"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`uyns-segmented__btn ${theme === "dark" ? "is-active" : ""}`}
                >
                  <Moon className="w-4 h-4" />
                  <span>{isAr ? "ليلي (Dark)" : "Dark"}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
