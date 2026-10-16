import dns from "node:dns";
import express from "express";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

dns.setDefaultResultOrder("ipv4first");
dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Server-side in-memory runtime store for Gemini API keys & models
let runtimeGeminiConfig = {
  apiKeys: [] as string[],
  textModel: process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
  imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
  ttsModel: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
  ttsVoice: process.env.GEMINI_TTS_VOICE || "Charon",
};

// Multi-key round-robin cursor, active concurrency tracker, and temporary cooldown tracker for failed/rate-limited keys
let geminiKeyCursor = 0;
const failedKeyCooldownUntil = new Map<string, number>();
const activeRequestsPerKey = new Map<string, number>();

function parseKeysString(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.flatMap((v) => parseKeysString(v));
  }
  const str = String(val).trim();
  if (!str) return [];
  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) return arr.flatMap((v) => parseKeysString(v));
    } catch {}
  }
  return str
    .split(/[\n\r,;|\s]+/)
    .map((k) => k.trim().replace(/^["']+|["']+$/g, ""))
    .filter(
      (k) =>
        k.length >= 15 &&
        k !== "MY_GEMINI_API_KEY" &&
        k !== "YOUR_GEMINI_API_KEY" &&
        !k.includes("••")
    );
}

// Dynamic Model Quota Exhaustion & Cooldown Tracker
const modelQuotaExhaustedUntil = new Map<string, number>();

export function getActiveGoogleAccountInfo() {
  const activeKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    "";
  const hasPlatformKey =
    Boolean(activeKey) &&
    activeKey !== "MY_GEMINI_API_KEY" &&
    activeKey !== "YOUR_GEMINI_API_KEY" &&
    activeKey.length >= 15;

  return {
    isDynamic: true,
    hasActiveKey: hasPlatformKey,
    source: hasPlatformKey
      ? "Google AI Studio Platform (Active Session)"
      : "Manual / Configured",
    userEmail: process.env.USER_EMAIL || "Cicinourcr07@gmail.com",
    activeProject: process.env.PROJECT_ID || "0d707b6a-3cdb-43f5-a6bb-c30690c9769d",
    autoModelSwitchingEnabled: true,
  };
}

export function resolveGeminiApiKeys(reqBody?: any): string[] {
  // Always refresh environment in case user switched account or updated secrets
  try {
    dotenv.config();
  } catch {}

  const seen = new Set<string>();
  const addAll = (items: string[]) => {
    for (const k of items) {
      if (k && !seen.has(k)) seen.add(k);
    }
  };

  // 1. PRIMARY PRIORITY: Active Google account / platform-injected credentials
  // This ensures changing Google accounts in AI Studio immediately takes effect.
  addAll(parseKeysString(process.env.GEMINI_API_KEY));
  addAll(parseKeysString(process.env.GOOGLE_API_KEY));
  addAll(parseKeysString(process.env.GOOGLE_GENAI_API_KEY));
  addAll(parseKeysString(process.env.GEMINI_API_KEYS));
  addAll(parseKeysString(process.env.GOOGLE_API_KEYS));

  // 2. Server runtime-configured Gemini keys
  addAll(runtimeGeminiConfig.apiKeys);

  // 3. User request-supplied keys (secondary fallback workers)
  if (reqBody && !reqBody.useActiveAccountOnly) {
    addAll(parseKeysString(reqBody.geminiApiKeys));
    addAll(parseKeysString(reqBody.geminiKeys));
    addAll(parseKeysString(reqBody?.geminiConfig?.apiKeys));
    addAll(parseKeysString(reqBody?.geminiConfig?.apiKey));
    addAll(parseKeysString(reqBody?.codecraftConfig?.apiKeys));
    addAll(parseKeysString(reqBody?.codecraftConfig?.apiKey));
  }

  // 4. Numbered env vars: GEMINI_API_KEY_1..50, GOOGLE_API_KEY_1..50, GEMINI_KEY_1..50
  for (let i = 1; i <= 50; i++) {
    addAll(parseKeysString(process.env[`GEMINI_API_KEY_${i}`]));
    addAll(parseKeysString(process.env[`GOOGLE_API_KEY_${i}`]));
    addAll(parseKeysString(process.env[`GEMINI_KEY_${i}`]));
  }

  // 5. Any other environment variable matching /^(GEMINI|GOOGLE)_.*API_KEY/i
  for (const [envName, envVal] of Object.entries(process.env)) {
    if (/^(?:VITE_|NEXT_PUBLIC_)?(?:GEMINI|GOOGLE)_.*API_KEY/i.test(envName)) {
      addAll(parseKeysString(envVal));
    }
  }

  return Array.from(seen);
}

function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export function resolveGeminiTextModel(reqBody?: any): string {
  const candidate = (
    reqBody?.textModel ||
    reqBody?.model ||
    reqBody?.geminiConfig?.textModel ||
    reqBody?.aiSettings?.textModel ||
    runtimeGeminiConfig.textModel ||
    process.env.GEMINI_TEXT_MODEL ||
    "gemini-3.8-flash"
  );
  const trimmed = String(candidate).trim().replace(/^models\//, "");
  return trimmed || "gemini-3.8-flash";
}

export function buildGeminiTextConfig(modelName: string, extraConfig: Record<string, any> = {}): Record<string, any> {
  const config: Record<string, any> = { ...extraConfig };
  const cleanModel = modelName.replace(/^models\//, "");

  // Only Gemini 3 & Gemini 4 models support thinkingConfig
  const isGemini3Or4 = /^gemini-[34](\.|$)/.test(cleanModel);
  if (isGemini3Or4) {
    if (!config.thinkingConfig) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
  } else {
    // Crucial: remove thinkingConfig for Gemini 2.5 series to prevent 400 Bad Request during fallback
    delete config.thinkingConfig;
  }
  return config;
}

export function getModelFallbackChain(initialModel: string, customChain?: string[]): string[] {
  if (Array.isArray(customChain) && customChain.length > 0) {
    return Array.from(new Set(customChain.filter(Boolean)));
  }

  const clean = String(initialModel || "").replace(/^models\//, "").trim() || "gemini-3.8-flash";

  // Full compatible text and reasoning fallback cascade using strictly valid active free-tier models
  const standardTextCascade = [
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.1-pro-preview",
  ];

  const chain = [clean, ...standardTextCascade.filter((m) => m !== clean)];
  return Array.from(new Set(chain.filter(Boolean)));
}

function extractErrorDetails(err: any): {
  isQuotaExhausted: boolean;
  isDemandSpike: boolean;
  isKeyAuthError: boolean;
  msg: string;
} {
  try {
    const rawMsg = String(err?.message || "");
    const status = Number(err?.status || err?.code || err?.error?.code || 0);
    let fullStr = `${rawMsg} status:${status}`;
    try {
      fullStr += ` ${JSON.stringify(err)}`;
    } catch {}

    const isQuotaExhausted =
      status === 429 ||
      /resource[_\s]+(?:has[_\s]+been[_\s]+)?exhausted|quota[_\s]+exceeded|rate[_\s]+limit|too\s*many\s*requests|429|per-minute|per-day|exceeded\s*your\s*current\s*quota|check\s*your\s*plan\s*and\s*billing/i.test(
        fullStr
      ) ||
      status === 404 ||
      /not\s*found|is\s*not\s*supported\s*for\s*generateContent|unknown\s*model|does\s*not\s*exist/i.test(
        fullStr
      );

    const isDemandSpike =
      status === 503 ||
      status === 504 ||
      /503|504|high\s*demand|spikes\s*in\s*demand|temporarily\s*unavailable|unavailable|overloaded|model\s*is\s*experiencing/i.test(
        fullStr
      );

    const isKeyAuthError =
      status === 400 &&
      /API_KEY_INVALID|API\s*key\s*not\s*valid|invalid\s*api\s*key|permission_denied/i.test(
        fullStr
      );

    return {
      isQuotaExhausted,
      isDemandSpike,
      isKeyAuthError,
      msg: fullStr.slice(0, 160),
    };
  } catch {
    return {
      isQuotaExhausted: false,
      isDemandSpike: false,
      isKeyAuthError: false,
      msg: String(err || ""),
    };
  }
}

// Universal Self-Healing Gemini Multi-Key & Autonomous Model Cascade Engine
// 1. Dynamic Active Google Account Connection (zero manual API key configuration required)
// 2. Continuous Automatic Fallback across compatible Gemini models whenever quota (429) or capacity (503) is exhausted
// 3. Multi-worker round-robin load distribution
async function executeGeminiWithFailover<T>(
  operation: (ai: GoogleGenAI, keyIndex: number, totalKeys: number, activeModel: string) => Promise<T>,
  reqBody?: any,
  parallelWorkerIdx?: number,
  customFallbackChain?: string[]
): Promise<T> {
  const allKeys = resolveGeminiApiKeys(reqBody);
  if (allKeys.length === 0) {
    throw new Error(
      "لم يتم العثور على مفتاح Gemini API النشط في المشروع. تأكد من تفعيل Gemini API لحساب Google المستخدم في Google AI Studio."
    );
  }

  const requestedModel = resolveGeminiTextModel(reqBody);
  const modelChain = getModelFallbackChain(requestedModel, customFallbackChain);

  const now = Date.now();
  // Filter out models currently in active quota cooldown, unless all models are in cooldown
  const availableModels = modelChain.filter(
    (m) => (modelQuotaExhaustedUntil.get(m) || 0) <= now
  );
  const modelsToAttempt = availableModels.length > 0 ? availableModels : modelChain;

  let lastError: any = null;

  for (let mIdx = 0; mIdx < modelsToAttempt.length; mIdx++) {
    const modelToTry = modelsToAttempt[mIdx];
    const isFallbackModel = modelToTry !== requestedModel;

    const healthyKeys = allKeys.filter((k) => (failedKeyCooldownUntil.get(k) || 0) <= Date.now());
    const candidatePool = healthyKeys.length > 0 ? healthyKeys : allKeys;

    let preferredKey: string;
    if (typeof parallelWorkerIdx === "number") {
      preferredKey = candidatePool[Math.abs(parallelWorkerIdx) % candidatePool.length];
    } else {
      const keysWithLoad = candidatePool.map((k) => ({
        key: k,
        active: activeRequestsPerKey.get(k) || 0,
      }));
      const minActive = Math.min(...keysWithLoad.map((k) => k.active));
      const leastBusyKeys = keysWithLoad.filter((k) => k.active === minActive).map((k) => k.key);
      const pickIdx = Math.abs(geminiKeyCursor++) % leastBusyKeys.length;
      preferredKey = leastBusyKeys[pickIdx];
    }

    const orderedKeys = [
      preferredKey,
      ...candidatePool.filter((k) => k !== preferredKey),
      ...allKeys.filter((k) => !candidatePool.includes(k)),
    ];

    let modelExhaustedOrSpike = false;

    for (let attempt = 0; attempt < orderedKeys.length; attempt++) {
      const key = orderedKeys[attempt];
      const originalKeyNumber = allKeys.indexOf(key) + 1;
      const ai = createGeminiClient(key);

      activeRequestsPerKey.set(key, (activeRequestsPerKey.get(key) || 0) + 1);
      try {
        const result = await operation(ai, originalKeyNumber - 1, allKeys.length, modelToTry);
        
        // Success: clear quota cooldown for this model and key
        modelQuotaExhaustedUntil.delete(modelToTry);
        failedKeyCooldownUntil.delete(key);

        if (isFallbackModel) {
          console.log(
            `[Gemini Auto-Switch SUCCESS] Successfully completed operation with fallback model '${modelToTry}' after quota exhaustion on '${requestedModel}'.`
          );
        }

        // Attach model telemetry to result if object
        if (result && typeof result === "object") {
          (result as any)._usedModel = modelToTry;
          (result as any)._initialModel = requestedModel;
          (result as any)._modelSwitched = isFallbackModel;
        }

        return result;
      } catch (err: any) {
        lastError = err;
        const { isQuotaExhausted, isDemandSpike, isKeyAuthError, msg } = extractErrorDetails(err);

        if (isQuotaExhausted) {
          // Put this model in quota cooldown for 60 seconds
          modelQuotaExhaustedUntil.set(modelToTry, Date.now() + 60_000);
          const nextModel = modelsToAttempt[mIdx + 1] || "none";
          console.warn(
            `[Gemini Auto-Switch] Quota exhausted for model '${modelToTry}' (${msg}). Automatically switching immediately to next available model in chain: '${nextModel}'...`
          );
          modelExhaustedOrSpike = true;
          // Break key attempt loop immediately to advance to the next compatible model!
          break;
        }

        if (isDemandSpike) {
          console.warn(
            `[Gemini Auto-Resilience] Model '${modelToTry}' experienced capacity surge (503). Advancing immediately to next model in chain...`
          );
          modelExhaustedOrSpike = true;
          break;
        }

        if (isKeyAuthError) {
          failedKeyCooldownUntil.set(key, Date.now() + 120_000);
        } else {
          failedKeyCooldownUntil.set(key, Date.now() + 30_000);
        }

        if (attempt < orderedKeys.length - 1) {
          console.warn(
            `[Gemini Multi-Key Failover] Key #${originalKeyNumber}/${allKeys.length} failed (${msg.slice(
              0,
              90
            )}), failing over to next key...`
          );
          continue;
        }
      } finally {
        const cur = activeRequestsPerKey.get(key) || 1;
        activeRequestsPerKey.set(key, Math.max(0, cur - 1));
      }
    }

    // If quota was exhausted or capacity spiked, loop will now try next model in modelsToAttempt
    if (modelExhaustedOrSpike && mIdx < modelsToAttempt.length - 1) {
      continue;
    }
  }

  throw lastError;
}

// External / Custom API (OpenAI-Compatible: OpenAI, DeepSeek, OpenRouter, Groq, Ollama, etc.)
let runtimeExternalConfig = {
  enabled: process.env.EXTERNAL_API_ENABLED === "true",
  apiKey: process.env.EXTERNAL_API_KEY || process.env.OPENAI_API_KEY || process.env.CODECRAFT_API_KEY || "",
  baseUrl: process.env.EXTERNAL_BASE_URL || process.env.OPENAI_BASE_URL || process.env.CODECRAFT_BASE_URL || "https://api.openai.com/v1",
  model: process.env.EXTERNAL_MODEL || process.env.OPENAI_MODEL || process.env.CODECRAFT_TEXT_MODEL || "gpt-4o-mini",
};

function resolveEffectiveProvider(requestedProvider: string | undefined, reqBody: any): string {
  // If explicitly requested in route call or payload
  if (
    requestedProvider === "external" ||
    requestedProvider === "custom" ||
    requestedProvider === "codecraft" ||
    requestedProvider === "openai"
  ) {
    return "external";
  }
  if (requestedProvider === "gemini") {
    return "gemini";
  }
  if (
    reqBody?.activeProvider === "external" ||
    reqBody?.activeProvider === "custom" ||
    reqBody?.activeProvider === "codecraft" ||
    reqBody?.provider === "external" ||
    reqBody?.provider === "custom" ||
    reqBody?.provider === "codecraft" ||
    reqBody?.externalApiConfig?.enabled === true ||
    reqBody?.customApiConfig?.enabled === true
  ) {
    return "external";
  }
  if (reqBody?.activeProvider === "gemini" || reqBody?.provider === "gemini") {
    return "gemini";
  }
  if (runtimeExternalConfig.enabled && runtimeExternalConfig.apiKey) {
    return "external";
  }
  return "gemini";
}

function getExternalApiCreds(reqBody: any) {
  const cfg =
    reqBody?.externalApiConfig ||
    reqBody?.customApiConfig ||
    reqBody?.codecraftConfig ||
    {};
  const apiKey = String(cfg.apiKey || runtimeExternalConfig.apiKey || "").trim();
  const rawBase = String(cfg.baseUrl || runtimeExternalConfig.baseUrl || "https://api.openai.com/v1").trim();
  const baseUrl = (rawBase || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = String(cfg.model || cfg.textModel || runtimeExternalConfig.model || "gpt-4o-mini").trim() || "gpt-4o-mini";

  return {
    apiKey,
    baseUrl,
    model,
    textModel: model,
    imageModel: model,
    ttsModel: model,
    ttsVoice: "alloy",
  };
}

const getCodeCraftCreds = getExternalApiCreds;

async function callExternalChatCompletion(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  imageBase64?: string | null;
  imageMime?: string;
  jsonMode?: boolean;
}): Promise<string> {
  const { apiKey, baseUrl, model, prompt, systemPrompt, imageBase64, imageMime, jsonMode } = opts;
  if (!apiKey) {
    throw new Error(
      "لم يتم إدخال مفتاح الـ API الخارجي (API Key). يرجى فتح الإعدادات (Settings) وتعيين المفتاح."
    );
  }
  const cleanBase = (baseUrl || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  const endpoint = cleanBase.endsWith("/chat/completions")
    ? cleanBase
    : `${cleanBase}/chat/completions`;

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  if (imageBase64) {
    const cleanB64 = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${imageMime || "image/jpeg"};base64,${imageBase64}`;
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: cleanB64 } },
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const payload: any = {
    model: model || "gpt-4o-mini",
    messages,
    temperature: 0.7,
  };
  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr: any) {
    throw new Error(`تعذر الاتصال بالرابط الخارجي (${endpoint}): ${netErr.message || String(netErr)}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // If the provider returned HTTP 400 because response_format is not supported, retry automatically without it
    if (
      jsonMode &&
      res.status === 400 &&
      (errText.includes("response_format") ||
        errText.includes("json_object") ||
        errText.includes("unrecognized") ||
        errText.includes("not supported") ||
        errText.includes("schema"))
    ) {
      delete payload.response_format;
      try {
        const retryRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });
        if (retryRes.ok) {
          const retryData: any = await retryRes.json();
          const retryMsg = retryData?.choices?.[0]?.message?.content ?? "";
          return typeof retryMsg === "string" ? retryMsg : JSON.stringify(retryMsg);
        }
      } catch {}
    }
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        detail = parsed.error.message;
      }
    } catch {}
    throw new Error(`خطأ من الـ API الخارجي (${res.status}): ${detail}`);
  }

  const data: any = await res.json();
  const rawMsg = data?.choices?.[0]?.message?.content ?? "";
  return typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg);
}

const callCodeCraftChat = callExternalChatCompletion;

function parseJsonClean(rawText: string) {
  const str = String(rawText || "").trim();
  if (!str) return {};
  const cleaned = str
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (
      firstBracket !== -1 &&
      lastBracket > firstBracket &&
      (firstBrace === -1 || firstBracket < firstBrace)
    ) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
      } catch {}
    }
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
    return {};
  }
}

// Health & Gemini Multi-Key Pool Status Route
app.get("/api/health", (_req, res) => {
  const geminiKeys = resolveGeminiApiKeys();
  res.json({
    ok: true,
    runtime: process.env.VERCEL ? "vercel-serverless" : "node-express",
    geminiConfigured: geminiKeys.length > 0,
    geminiKeyCount: geminiKeys.length,
    youtubeApiConfigured: !!process.env.YOUTUBE_API_KEY,
  });
});

app.get("/api/account/status", (_req, res) => {
  const geminiKeys = resolveGeminiApiKeys();
  const accountInfo = getActiveGoogleAccountInfo();
  const fallbackChain = getModelFallbackChain("gemini-3.8-flash");
  const now = Date.now();
  const exhaustedModels = Array.from(modelQuotaExhaustedUntil.entries())
    .filter(([_, until]) => until > now)
    .map(([m, until]) => ({ model: m, remainingSec: Math.ceil((until - now) / 1000) }));

  res.json({
    ok: true,
    activeGoogleAccount: {
      ...accountInfo,
      keyCount: geminiKeys.length,
      isConfigured: geminiKeys.length > 0,
    },
    autoModelSwitching: {
      enabled: true,
      currentTextModel: runtimeGeminiConfig.textModel,
      fallbackChain,
      exhaustedModels,
    },
  });
});

app.post("/api/account/sync", (_req, res) => {
  try {
    dotenv.config();
  } catch {}
  modelQuotaExhaustedUntil.clear();
  failedKeyCooldownUntil.clear();
  const geminiKeys = resolveGeminiApiKeys();
  const accountInfo = getActiveGoogleAccountInfo();

  res.json({
    ok: true,
    message: "تم تحديث ومزامنة بيانات حساب Google النشط وإعادة ضبط حصص النماذج بنجاح.",
    activeGoogleAccount: {
      ...accountInfo,
      keyCount: geminiKeys.length,
      isConfigured: geminiKeys.length > 0,
    },
  });
});

app.get("/api/providers/status", (_req, res) => {
  const geminiKeys = resolveGeminiApiKeys();
  const accountInfo = getActiveGoogleAccountInfo();
  const now = Date.now();
  const exhaustedModels = Array.from(modelQuotaExhaustedUntil.entries())
    .filter(([_, until]) => until > now)
    .map(([m, until]) => ({ model: m, remainingSec: Math.ceil((until - now) / 1000) }));

  res.json({
    geminiConfigured: geminiKeys.length > 0,
    geminiKeyCount: geminiKeys.length,
    youtubeApiConfigured: !!process.env.YOUTUBE_API_KEY,
    activeGoogleAccount: {
      ...accountInfo,
      keyCount: geminiKeys.length,
      isConfigured: geminiKeys.length > 0,
    },
    autoModelSwitching: {
      enabled: true,
      fallbackChain: getModelFallbackChain("gemini-3.8-flash"),
      exhaustedModels,
    },
    geminiConfig: {
      hasKey: geminiKeys.length > 0,
      keyCount: geminiKeys.length,
      textModel: runtimeGeminiConfig.textModel,
      imageModel: runtimeGeminiConfig.imageModel,
      ttsModel: runtimeGeminiConfig.ttsModel,
      ttsVoice: runtimeGeminiConfig.ttsVoice,
    },
    externalConfig: {
      enabled: runtimeExternalConfig.enabled,
      hasKey: !!runtimeExternalConfig.apiKey,
      baseUrl: runtimeExternalConfig.baseUrl,
      model: runtimeExternalConfig.model,
    },
  });
});

// Save & Test Multiple Gemini API Keys
const handleUpdateGeminiConfig = async (req: express.Request, res: express.Response) => {
  try {
    const {
      apiKeys,
      apiKey,
      textModel,
      imageModel,
      ttsModel,
      ttsVoice,
      testConnection,
    } = req.body || {};

    const parsedIncoming = [
      ...parseKeysString(apiKeys),
      ...parseKeysString(apiKey),
    ];
    if (parsedIncoming.length > 0 || Array.isArray(apiKeys) || typeof apiKey === "string") {
      runtimeGeminiConfig.apiKeys = Array.from(new Set(parsedIncoming));
      failedKeyCooldownUntil.clear();
    }
    if (textModel) runtimeGeminiConfig.textModel = String(textModel).trim();
    if (imageModel) runtimeGeminiConfig.imageModel = String(imageModel).trim();
    if (ttsModel) runtimeGeminiConfig.ttsModel = String(ttsModel).trim();
    if (ttsVoice) runtimeGeminiConfig.ttsVoice = String(ttsVoice).trim();

    const activePool = resolveGeminiApiKeys(req.body);
    const keyStatuses: Array<{ index: number; masked: string; ok: boolean; error?: string }> = [];

    if (testConnection) {
      if (activePool.length === 0) {
        return res.status(400).json({
          error:
            "لم يتم إدخال أي مفتاح Gemini API. أضف مفتاحاً واحداً أو أكثر ثم اضغط فحص المفاتيح.",
        });
      }
      // Test all keys in parallel for fast verification
      const checks = await Promise.all(
        activePool.map(async (k, idx) => {
          const masked = `${k.slice(0, 6)}...${k.slice(-4)}`;
          try {
            const ai = createGeminiClient(k);
            const modelToTest = resolveGeminiTextModel(req.body);
            const testChain = getModelFallbackChain(modelToTest);
            let verified = false;
            let lastErr: any = null;

            for (const m of testChain) {
              try {
                await ai.models.generateContent({
                  model: m,
                  contents: "OK",
                  config: buildGeminiTextConfig(m),
                });
                verified = true;
                break;
              } catch (checkErr: any) {
                lastErr = checkErr;
                const errStr = String(checkErr?.message || checkErr || "");
                if (
                  checkErr?.status === 503 ||
                  errStr.includes("503") ||
                  errStr.includes("high demand") ||
                  errStr.includes("UNAVAILABLE") ||
                  errStr.includes("no longer available")
                ) {
                  // Temporary model demand spike or retirement; test next model in chain to verify key validity
                  continue;
                }
                break;
              }
            }

            if (!verified) throw lastErr;

            failedKeyCooldownUntil.delete(k);
            return { index: idx + 1, masked, ok: true };
          } catch (err: any) {
            return {
              index: idx + 1,
              masked,
              ok: false,
              error: String(err?.message || err || "Failed").slice(0, 120),
            };
          }
        })
      );
      keyStatuses.push(...checks);
      const workingCount = checks.filter((c) => c.ok).length;
      if (workingCount === 0) {
        return res.status(400).json({
          error: `فشل الاتصال بجميع مفاتيح Gemini (${checks.length}). تأكد من صلاحية المفاتيح أو الحصة (Quota).`,
          keyStatuses,
        });
      }
    }

    res.json({
      ok: true,
      hasKey: activePool.length > 0,
      keyCount: activePool.length,
      workingCount: keyStatuses.length ? keyStatuses.filter((k) => k.ok).length : activePool.length,
      keyStatuses,
      textModel: runtimeGeminiConfig.textModel,
      imageModel: runtimeGeminiConfig.imageModel,
      ttsModel: runtimeGeminiConfig.ttsModel,
      ttsVoice: runtimeGeminiConfig.ttsVoice,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to verify Gemini API keys." });
  }
};

app.post("/api/providers/gemini-config", handleUpdateGeminiConfig);
app.post("/api/providers/codecraft-config", handleUpdateGeminiConfig);

// Dynamic Discovery of All Available Gemini Text & Reasoning Models
app.all("/api/providers/gemini-models", async (req, res) => {
  try {
    const activePool = resolveGeminiApiKeys(req.body);
    const key = activePool[0] || process.env.GEMINI_API_KEY;

    // Standard curated models (strictly valid active models)
    const standardModels = [
      { id: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash", description: "فائق السرعة وخفة المعالجة وتوليد الأفكار (الموصى به)", category: "Gemini 3", isRecommended: true },
      { id: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro Preview", description: "تفكير عميق واستنتاج متقدم للسيناريوهات المعقدة", category: "Gemini 3" },
      { id: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite", description: "استجابة فورية وأقصى سرعة تشغيل", category: "Gemini 3" },
      { id: "gemini-4-argon", displayName: "Gemini 4 Argon", description: "النموذج الفائق للقدرات والمهام المعقدة", category: "Gemini 4" },
      { id: "gemini-flash-latest", displayName: "Gemini Flash Latest", description: "أحدث إصدار Flash تلقائياً بشكل دائم", category: "Latest" },
      { id: "gemini-pro-latest", displayName: "Gemini Pro Latest", description: "أحدث إصدار Pro تلقائياً بشكل دائم", category: "Latest" },
    ];

    if (!key) {
      return res.json({
        ok: true,
        source: "standard",
        currentTextModel: runtimeGeminiConfig.textModel,
        models: standardModels,
      });
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
        headers: { "User-Agent": "aistudio-build" },
      });
      if (response.ok) {
        const data = await response.json();
        const rawList: any[] = Array.isArray(data.models) ? data.models : [];
        const textModels = rawList
          .filter((m) => {
            const name = (m.name || "").replace(/^models\//, "");
            const supported = m.supportedGenerationMethods || [];
            if (!supported.includes("generateContent")) return false;
            // Exclude non-text models (embeddings, image-only, tts, veo, live)
            if (name.includes("embedding") || name.includes("imagen") || name.includes("banana")) return false;
            if (name.includes("-image") || name.includes("-tts") || name.includes("veo")) return false;
            if (name.includes("robotics") || name.includes("computer-use")) return false;
            return true;
          })
          .map((m): any => {
            const id = (m.name || "").replace(/^models\//, "");
            let category = "Gemini";
            if (id.startsWith("gemini-3")) category = "Gemini 3";
            else if (id.startsWith("gemini-2.5")) category = "Gemini 2.5";
            else if (id.includes("latest")) category = "Latest";
            return {
              id,
              displayName: m.displayName || id,
              description: m.description || "",
              category,
              inputTokenLimit: m.inputTokenLimit,
              outputTokenLimit: m.outputTokenLimit,
              isRecommended: id === "gemini-3.8-flash",
            };
          });

        if (textModels.length > 0) {
          // Merge curated models to guarantee nice Arabic descriptions
          const existingMap = new Map<string, any>(textModels.map((m: any) => [m.id, m]));
          for (const sm of standardModels) {
            if (existingMap.has(sm.id)) {
              const cur = existingMap.get(sm.id)!;
              cur.description = sm.description;
              cur.category = sm.category;
              cur.isRecommended = Boolean(sm.isRecommended);
            } else {
              textModels.push(sm);
            }
          }
          return res.json({
            ok: true,
            source: "live-api",
            currentTextModel: runtimeGeminiConfig.textModel,
            models: textModels,
          });
        }
      }
    } catch (apiErr) {
      console.warn("[Gemini Models Discovery] Could not reach Google Models API, falling back to standard models list:", apiErr);
    }

    return res.json({
      ok: true,
      source: "standard",
      currentTextModel: runtimeGeminiConfig.textModel,
      models: standardModels,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch Gemini models" });
  }
});

// Save & Configure External / Custom API
app.post("/api/providers/external-config", (req, res) => {
  try {
    const { apiKey, baseUrl, model, enabled } = req.body || {};
    if (typeof apiKey === "string") runtimeExternalConfig.apiKey = apiKey.trim();
    if (typeof baseUrl === "string") runtimeExternalConfig.baseUrl = baseUrl.trim();
    if (typeof model === "string") runtimeExternalConfig.model = model.trim();
    if (typeof enabled === "boolean") runtimeExternalConfig.enabled = enabled;
    res.json({
      ok: true,
      externalConfig: {
        enabled: runtimeExternalConfig.enabled,
        hasKey: !!runtimeExternalConfig.apiKey,
        baseUrl: runtimeExternalConfig.baseUrl,
        model: runtimeExternalConfig.model,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update external config." });
  }
});

// Test Connection to External / Custom API
app.post("/api/providers/external-test", async (req, res) => {
  try {
    const creds = getExternalApiCreds(req.body);
    if (!creds.apiKey) {
      return res.status(400).json({
        ok: false,
        error: "لم يتم إدخال مفتاح الـ API الخارجي. أدخل الـ API Key ثم اضغط فحص الاتصال.",
      });
    }
    const start = Date.now();
    const testResult = await callExternalChatCompletion({
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
      model: creds.model,
      prompt: "Respond with strictly the word: OK",
    });
    const latency = Date.now() - start;
    res.json({
      ok: true,
      model: creds.model,
      baseUrl: creds.baseUrl,
      latencyMs: latency,
      sampleResponse: testResult.trim().slice(0, 50),
    });
  } catch (err: any) {
    res.status(400).json({
      ok: false,
      error: err.message || "Failed to connect to external API.",
    });
  }
});

// Robust YouTube URL & Video ID parser supporting watch, youtu.be, shorts, embed, live, mobile, and raw 11-char IDs
export function extractVideoId(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // Direct 11-character YouTube video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return raw;
  }

  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    if (
      host === "youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      const v = u.searchParams.get("v") || u.searchParams.get("vi");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const parts = u.pathname.split("/").filter(Boolean);
      if (
        parts.length >= 2 &&
        ["shorts", "embed", "v", "live", "watch", "e"].includes(parts[0].toLowerCase())
      ) {
        const candidate = parts[1];
        if (candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate)) return candidate;
      }
    }
  } catch {
    // Fall through to regex extraction
  }

  const m = raw.match(
    /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|v\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  if (m && m[1]) return m[1];

  return null;
}

function formatIsoDuration(iso: string): string {
  if (!iso || typeof iso !== "string") return "";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return iso;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function handleYouTubeMetadata(req: express.Request, res: express.Response) {
  try {
    const rawUrl = (req.body?.url || req.query?.url || req.body?.videoId || req.query?.videoId || "") as string;
    if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
      return res.status(400).json({ error: "Please provide a valid YouTube URL or video ID." });
    }

    const videoId = extractVideoId(rawUrl);
    if (!videoId) {
      return res.status(400).json({
        error:
          "Invalid YouTube URL or Video ID. Supported formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/..., youtube.com/embed/..., or an 11-character video ID.",
      });
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let title = "";
    let author = "";
    let authorUrl = "";
    let description = "";
    let duration = "";
    let durationSec = 0;
    let views = "";
    let publishedAt = "";
    let thumbnailUrl = "";
    let oembedOk = false;
    let dataApiOk = false;

    // 1. Query YouTube oEmbed (public, no API key required)
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NarrativeStudio/1.0)",
            Accept: "application/json",
          },
        }
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title || "";
        author = data.author_name || "";
        authorUrl = data.author_url || "";
        if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
        oembedOk = true;
      } else if (oembedRes.status === 404 || oembedRes.status === 401 || oembedRes.status === 403) {
        // Might be private, deleted, or embedding disabled; check Data API or Noembed fallback
      }
    } catch {}

    // 1b. Fallback public oEmbed via noembed.com if direct youtube oEmbed failed or was blocked
    if (!oembedOk) {
      try {
        const noembedRes = await fetch(
          `https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`
        );
        if (noembedRes.ok) {
          const neData = await noembedRes.json();
          if (neData && !neData.error && neData.title) {
            title = neData.title || title;
            author = neData.author_name || author;
            authorUrl = neData.author_url || authorUrl;
            if (neData.thumbnail_url) thumbnailUrl = neData.thumbnail_url;
            oembedOk = true;
          }
        }
      } catch {}
    }

    // 2. Enrich with YouTube Data API v3 if YOUTUBE_API_KEY is configured
    if (process.env.YOUTUBE_API_KEY) {
      try {
        const ytApiRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(
            videoId
          )}&key=${encodeURIComponent(process.env.YOUTUBE_API_KEY)}`
        );
        if (ytApiRes.ok) {
          const ytData = await ytApiRes.json();
          const item = ytData.items?.[0];
          if (item) {
            dataApiOk = true;
            title = item.snippet?.title || title;
            author = item.snippet?.channelTitle || author;
            description = item.snippet?.description || "";
            publishedAt = item.snippet?.publishedAt || "";
            const rawIsoDur = item.contentDetails?.duration || "";
            duration = formatIsoDuration(rawIsoDur) || rawIsoDur;
            const isoMatch = rawIsoDur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
            if (isoMatch) {
              durationSec =
                parseInt(isoMatch[1] || "0", 10) * 3600 +
                parseInt(isoMatch[2] || "0", 10) * 60 +
                parseInt(isoMatch[3] || "0", 10);
            }
            views = item.statistics?.viewCount || "";
            thumbnailUrl =
              item.snippet?.thumbnails?.maxres?.url ||
              item.snippet?.thumbnails?.standard?.url ||
              item.snippet?.thumbnails?.high?.url ||
              thumbnailUrl;
          }
        }
      } catch {}
    }

    // 3. Verify and fetch best available thumbnail for Vision analysis
    const candidateThumbUrls = [
      thumbnailUrl,
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    ].filter(Boolean);

    let thumbnailBase64: string | null = null;
    let thumbnailMime = "image/jpeg";
    let resolvedThumbUrl = "";

    for (const candidate of candidateThumbUrls) {
      try {
        const imgRes = await fetch(candidate);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          // Ignore tiny 1x1 or default 404 placeholder images (< 1.5KB)
          if (buf.byteLength > 1500) {
            thumbnailBase64 = buf.toString("base64");
            thumbnailMime = imgRes.headers.get("content-type") || "image/jpeg";
            resolvedThumbUrl = candidate;
            break;
          }
        }
      } catch {}
    }

    // Do not fabricate metadata if the video does not exist or is completely inaccessible
    if (!oembedOk && !dataApiOk && !title) {
      return res.status(404).json({
        error:
          "Could not retrieve metadata for this YouTube video. The video may be private, unavailable, or the video ID does not exist.",
        videoId,
      });
    }

    return res.json({
      videoId,
      url: canonicalUrl,
      title,
      author,
      authorUrl,
      description,
      duration,
      durationSec,
      views,
      publishedAt,
      thumbnailUrl: resolvedThumbUrl || thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      thumbnailBase64,
      thumbnailMime,
      source: dataApiOk ? "youtube_data_api_v3" : "youtube_oembed",
      transcriptAccessible: false,
      notice: dataApiOk
        ? "Full metadata, duration, description, and thumbnail retrieved via YouTube Data API v3. Paste a transcript or reference notes below if you want spoken-word pacing analysis."
        : "Public title, channel, and thumbnail retrieved via YouTube oEmbed. Full transcript and audio are not provided by oEmbed—paste a transcript or reference notes if you want spoken-content analysis.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch YouTube metadata." });
  }
}

// 1. Fetch YouTube Reference Metadata via authorized oEmbed / Data API (supports both POST and GET)
app.post("/api/youtube/metadata", handleYouTubeMetadata);
app.get("/api/youtube/metadata", handleYouTubeMetadata);

// Extract ONLY script & narration rules, filtering out any image, thumbnail or visual prompts
export function extractScriptOnlyRules(rulesStr: string): string {
  if (!rulesStr) return "";
  const lines = rulesStr.split("\n");
  const scriptLines: string[] = [];
  let inScriptSection = true;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(SCENE|IMAGE|VISUAL|THUMBNAIL|ASSET|CAMERA|SHOT)\s*(?:&|\+|\/)?\s*(?:RULES|PROMPT|DIRECTIVES|STYLE)?\s*[:：]/i.test(trimmed)) {
      inScriptSection = false;
      continue;
    }
    if (/^(SCRIPT|NARRATION|STORY|VOICEOVER|WRITING|TONE)\s*(?:RULES|DIRECTIVES|STYLE)?\s*[:：]/i.test(trimmed)) {
      inScriptSection = true;
      scriptLines.push(trimmed.replace(/^(SCRIPT|NARRATION|STORY|VOICEOVER|WRITING|TONE)\s*(?:RULES|DIRECTIVES|STYLE)?\s*[:：]\s*/i, ""));
      continue;
    }
    if (inScriptSection) {
      scriptLines.push(line);
    }
  }
  const result = scriptLines.join("\n").trim();
  return result || rulesStr;
}

// Clean and sanitize script to guarantee 100% pure voiceover narration text only
// Strips image prompts, visual descriptions, [Scene X] tags, speaker labels, etc.
export function cleanVoiceoverScriptOnly(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text;

  // Remove markdown code blocks
  cleaned = cleaned.replace(/^```[a-z]*\s*\n/i, "").replace(/\n```\s*$/i, "");

  // Remove lines that are image prompts or visual directions
  cleaned = cleaned.replace(
    /^\s*(?:\*{0,2}|[-*•]\s*)?(?:image\s*prompt|visual\s*prompt|scene\s*prompt|image\s*direction|visual\s*direction|prompt|visual|b-roll|visuals|camera|lighting|thumbnail|thumbnail\s*prompt|صورة|برومبت\s*(?:الصور|المشهد)?|وصف\s*(?:بصري|المشهد|الصورة)|توجيه\s*بصري|لقطة|المؤثرات\s*البصرية)\s*[:：\-–][^\n]*$/gim,
    ""
  );

  // Remove lines that are scene headings: e.g. "Scene 1: ...", "المشهد 1: ...", "[Scene 1]"
  cleaned = cleaned.replace(
    /^\s*(?:\*{0,2}|[-*•]\s*)?(?:scene|shot|مشهد|لقطة|فصل|act)\s*(?:\d+|[ivxlcdm]+|الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)?[^\n]*$/gim,
    ""
  );

  // Remove bracketed visual / prompt blocks: [Image: ...], [Visual: ...], [Scene 1: ...]
  cleaned = cleaned.replace(
    /\[\s*(?:scene|image|visual|prompt|b-roll|shot|camera|lighting|صورة|مشهد|برومبت|لقطة|توجيه)[^\]]*\]/gi,
    ""
  );

  // Remove inline speaker tags at beginning of lines: e.g. "Narrator:", "الراوي:"
  cleaned = cleaned.replace(
    /^\s*(?:\*{0,2})?(?:narrator|voiceover|voice-over|host|speaker|voice|actor|الراوي|المعلق\s*الصوتي|المعلق|الصوت)\s*[:：\-–]\s*/gim,
    ""
  );

  // Remove standalone chapter/scene headers markdown
  cleaned = cleaned.replace(/^\s*#{1,6}\s*(?:scene|act|part|chapter|المشهد|الفصل|الجزء|وصف)[^\n]*$/gim, "");

  // Remove bracketed directions: (Visual: ...), (Pause: 2s)
  cleaned = cleaned.replace(
    /\(\s*(?:visual|camera|sfx|music|sound|pause|image|b-roll|وصف|صورة|موسيقى|توقف)[^)]*\)/gi,
    ""
  );

  // Normalize excessive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

// 2. Analyze Reference + Thumbnail Vision + Generate 5 Original Concepts + Visual Style Lock
app.post("/api/ai/analyze-reference", async (req, res) => {
  try {
    const {
      projectName,
      youtubeUrl,
      referenceTitle,
      channelName,
      description,
      pastedTranscript,
      nichePreference,
      channelNiche,
      channelProfile,
      languagePreference,
      thumbnailBase64,
      thumbnailMime,
      provider: requestedProvider,
    } = req.body || {};

    const provider = resolveEffectiveProvider(requestedProvider, req.body);
    const effectiveNiche = String(channelNiche || nichePreference || channelProfile?.niche || "").trim();

    const nicheDirective = effectiveNiche
      ? `
================================================================================
🚨 MANDATORY CHANNEL NICHE RESTRICTION (SUPREME REQUIREMENT) 🚨
================================================================================
The user's channel operates EXCLUSIVELY in the following niche: "${effectiveNiche}".
ALL 5 generated concepts MUST belong 100% to this specific niche ("${effectiveNiche}").
Under NO circumstance should you generate concepts for other unrelated topics or niches!
You must borrow the reference video's storytelling pace, tension building, curiosity gap style, and viral mechanics,
BUT transpose everything completely into the user's channel niche ("${effectiveNiche}").
Every single concept's title, premise, hook, story structure, and payoff MUST be strictly within "${effectiveNiche}".
================================================================================`
      : "";

    const promptText = `You are an expert YouTube creative director and visual narrative analyst.
Analyze the provided YouTube reference information ${thumbnailBase64 ? "and the attached reference thumbnail image " : ""}to produce:
1. A comprehensive Reference Analysis Report.
2. A Visual Style Lock extracted from the reference's visual appeal (or tailored to the niche if no thumbnail was provided).
3. Exactly 5 distinct, original video concepts inspired by the reference's general appeal, curiosity gap, and audience—without copying the reference's title or script.
${nicheDirective}

Reference Details:
- Project Name: ${projectName || "Untitled Project"}
- YouTube URL: ${youtubeUrl || "N/A"}
- Reference Title: ${referenceTitle || "Not provided"}
- Channel: ${channelName || "Unknown"}
- Description: ${description || "Not provided"}
- Channel Niche: ${effectiveNiche || "Infer from reference"}
- Language Preference: ${languagePreference || "English (US)"}
- Pasted Transcript / Notes: ${pastedTranscript ? String(pastedTranscript).slice(0, 12000) : "Not provided (analyze based on title, metadata, and thumbnail vision only; note clearly in narrationTone that transcript was not supplied)"}

IMPORTANT RULES:
${effectiveNiche ? `- ALL 5 concepts MUST strictly belong to the specified channel niche: "${effectiveNiche}".` : "- Never assume the channel is about finance or business unless the reference explicitly is. Adapt naturally to history, science, documentary, mystery, nature, storytelling, education, technology, etc."}
- Generate 5 genuinely distinct, original concepts with compelling titles, premises, hooks, and payoffs.`;

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const rawJson = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt: `${promptText}\n\nReturn strictly valid JSON with keys: "analysis" (mainTopic, niche, subNiche, targetAudience, curiosityGap, openingHook, storytellingStructure, narrationTone, visualStyle, colorPalette, characterDesign, compositionLighting, engagementFactors[], originalOpportunities[], transcriptAnalyzed), "visualStyleLock" (artStyle, characterRules, facialVisibility, clothingSilhouette, colorPalette, lighting, backgroundTreatment, composition, lineworkShading, aspectRatio), and "concepts" (array of 5 objects with id, title, premise, niche, subNiche, targetAudience, mainHook, storyStructure, narrationStyle, visualDirection, viewerAppeal, differentiation, payoff).`,
        imageBase64: thumbnailBase64,
        imageMime: thumbnailMime,
        jsonMode: true,
      });
      return res.json(parseJsonClean(rawJson));
    }

    const parts: any[] = [];
    if (thumbnailBase64) {
      const cleanB64 = String(thumbnailBase64).replace(/^data:[^;]+;base64,/, "");
      parts.push({
        inlineData: {
          mimeType: thumbnailMime || "image/jpeg",
          data: cleanB64,
        },
      });
    }
    parts.push({ text: promptText });

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: { parts },
          config: buildGeminiTextConfig(modelToUse, {
            responseMimeType: "application/json",
            responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: {
                type: Type.OBJECT,
                properties: {
                  mainTopic: { type: Type.STRING },
                  niche: { type: Type.STRING },
                  subNiche: { type: Type.STRING },
                  targetAudience: { type: Type.STRING },
                  curiosityGap: { type: Type.STRING },
                  openingHook: { type: Type.STRING },
                  storytellingStructure: { type: Type.STRING },
                  narrationTone: { type: Type.STRING },
                  visualStyle: { type: Type.STRING },
                  colorPalette: { type: Type.STRING },
                  characterDesign: { type: Type.STRING },
                  compositionLighting: { type: Type.STRING },
                  engagementFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
                  originalOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
                  transcriptAnalyzed: { type: Type.BOOLEAN },
                },
                required: [
                  "mainTopic",
                  "niche",
                  "subNiche",
                  "targetAudience",
                  "curiosityGap",
                  "openingHook",
                  "storytellingStructure",
                  "narrationTone",
                  "visualStyle",
                  "colorPalette",
                  "characterDesign",
                  "compositionLighting",
                  "engagementFactors",
                  "originalOpportunities",
                  "transcriptAnalyzed",
                ],
              },
              visualStyleLock: {
                type: Type.OBJECT,
                properties: {
                  artStyle: { type: Type.STRING },
                  characterRules: { type: Type.STRING },
                  facialVisibility: { type: Type.STRING },
                  clothingSilhouette: { type: Type.STRING },
                  colorPalette: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                  backgroundTreatment: { type: Type.STRING },
                  composition: { type: Type.STRING },
                  lineworkShading: { type: Type.STRING },
                  aspectRatio: { type: Type.STRING },
                },
                required: [
                  "artStyle",
                  "characterRules",
                  "facialVisibility",
                  "clothingSilhouette",
                  "colorPalette",
                  "lighting",
                  "backgroundTreatment",
                  "composition",
                  "lineworkShading",
                  "aspectRatio",
                ],
              },
              concepts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    premise: { type: Type.STRING },
                    niche: { type: Type.STRING },
                    subNiche: { type: Type.STRING },
                    targetAudience: { type: Type.STRING },
                    mainHook: { type: Type.STRING },
                    storyStructure: { type: Type.STRING },
                    narrationStyle: { type: Type.STRING },
                    visualDirection: { type: Type.STRING },
                    viewerAppeal: { type: Type.STRING },
                    differentiation: { type: Type.STRING },
                    payoff: { type: Type.STRING },
                  },
                  required: [
                    "id",
                    "title",
                    "premise",
                    "niche",
                    "subNiche",
                    "targetAudience",
                    "mainHook",
                    "storyStructure",
                    "narrationStyle",
                    "visualDirection",
                    "viewerAppeal",
                    "differentiation",
                    "payoff",
                  ],
                },
              },
            },
            required: ["analysis", "visualStyleLock", "concepts"],
          },
        }),
      }),
      req.body
    );

    const parsed = parseJsonClean(response.text || "{}");
    if (parsed && typeof parsed === "object") {
      parsed._usedModel = (response as any)._usedModel;
      parsed._initialModel = (response as any)._initialModel;
      parsed._modelSwitched = (response as any)._modelSwitched;
    }
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "AI reference analysis failed." });
  }
});

// 3. Regenerate 5 Concepts
app.post("/api/ai/regenerate-concepts", async (req, res) => {
  try {
    const { analysis, customDirection, channelNiche, niche, provider: requestedProvider } = req.body || {};
    const provider = resolveEffectiveProvider(requestedProvider, req.body);
    const effectiveNiche = String(channelNiche || niche || analysis?.niche || "").trim();

    const nicheMandate = effectiveNiche
      ? `
================================================================================
🚨 MANDATORY CHANNEL NICHE RESTRICTION (SUPREME REQUIREMENT) 🚨
================================================================================
The user's channel operates EXCLUSIVELY in the following niche: "${effectiveNiche}".
ALL 5 generated concepts MUST belong 100% to this specific niche ("${effectiveNiche}").
Do NOT generate concepts in any other niche or topic category!
Every single concept's title, premise, hook, and narrative must be tailored precisely for the audience of "${effectiveNiche}".
================================================================================`
      : "";

    const prompt = `Generate 5 new, distinct, original YouTube video concepts based on this reference analysis:
${JSON.stringify(analysis, null, 2)}
${customDirection ? `Additional user direction: ${customDirection}` : ""}
${nicheMandate}
Return strictly JSON with key "concepts" (array of 5 objects with id, title, premise, niche, subNiche, targetAudience, mainHook, storyStructure, narrationStyle, visualDirection, viewerAppeal, differentiation, payoff).`;

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const raw = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt,
        jsonMode: true,
      });
      return res.json(parseJsonClean(raw));
    }

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: prompt,
          config: buildGeminiTextConfig(modelToUse, {
            responseMimeType: "application/json",
            responseSchema: {
            type: Type.OBJECT,
            properties: {
              concepts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    premise: { type: Type.STRING },
                    niche: { type: Type.STRING },
                    subNiche: { type: Type.STRING },
                    targetAudience: { type: Type.STRING },
                    mainHook: { type: Type.STRING },
                    storyStructure: { type: Type.STRING },
                    narrationStyle: { type: Type.STRING },
                    visualDirection: { type: Type.STRING },
                    viewerAppeal: { type: Type.STRING },
                    differentiation: { type: Type.STRING },
                    payoff: { type: Type.STRING },
                  },
                  required: [
                    "id",
                    "title",
                    "premise",
                    "niche",
                    "subNiche",
                    "targetAudience",
                    "mainHook",
                    "storyStructure",
                    "narrationStyle",
                    "visualDirection",
                    "viewerAppeal",
                    "differentiation",
                    "payoff",
                  ],
                },
              },
            },
            required: ["concepts"],
          },
        }),
      }),
      req.body
    );
    const parsed = parseJsonClean(response.text || "{}");
    if (parsed && typeof parsed === "object") {
      parsed._usedModel = (response as any)._usedModel;
      parsed._initialModel = (response as any)._initialModel;
      parsed._modelSwitched = (response as any)._modelSwitched;
    }
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to regenerate concepts." });
  }
});

// 4. Generate Full Narration Script or Transform Script
app.post("/api/ai/generate-script", async (req, res) => {
  try {
    const {
      concept,
      analysis,
      targetDurationMinutes,
      scriptPreset,
      channelProfile,
      language,
      action,
      currentScript,
      selectedText,
      customScriptPrompt,
      provider: requestedProvider,
    } = req.body || {};

    const provider = resolveEffectiveProvider(requestedProvider, req.body);
    const targetWords = Math.round((Number(targetDurationMinutes) || 8) * 145);

    // Fallback concept in case none was selected
    const effectiveConcept = concept || {
      title: analysis?.mainTopic || "Original Narrative Documentary",
      premise: analysis?.curiosityGap || "Investigative documentary exploring intriguing questions and deep truths.",
      niche: channelProfile?.niche || analysis?.niche || "Documentary",
      mainHook: analysis?.openingHook || "Start with an unexpected paradox in the first 15 seconds.",
      storyStructure: analysis?.storytellingStructure || "4-act narrative arc with escalating tension",
      narrationStyle: channelProfile?.narrationStyle || analysis?.narrationTone || "Curious, authoritative and atmospheric",
      payoff: "A profound concluding takeaway tying back to the initial mystery.",
    };

    const isArabic =
      /arabic|العربية|عربي/i.test(String(language || "")) ||
      /[\u0600-\u06FF]/.test(String(effectiveConcept.title || "")) ||
      /[\u0600-\u06FF]/.test(String(channelProfile?.promptRules || "")) ||
      /[\u0600-\u06FF]/.test(String(customScriptPrompt || ""));

    const langDirective = isArabic
      ? "CRITICAL LANGUAGE REQUIREMENT: Write the entire narration script in high-quality, expressive Modern Standard Arabic (لغة عربية فصحى معاصرة سينمائية راقية وجذابة). Ensure fluent narrative flow, vivid vocabulary, and natural voiceover phrasing."
      : `CRITICAL LANGUAGE REQUIREMENT: Write the entire narration script in ${language || "English (US)"}.`;

    // Supreme Priority: Channel Script & Narration Rules (filter out visual/image/thumbnail prompts so LLM never outputs image prompts)
    const rawCoreRules = channelProfile?.promptRules || channelProfile?.scriptStyle || "";
    const scriptOnlyCoreRules = extractScriptOnlyRules(rawCoreRules);
    const additionalScriptRules = channelProfile?.additionalScriptRules || "";
    const channelContext = `
================================================================================
🚨 SUPREME PRIORITY DIRECTIVE: CHANNEL SCRIPT RULES COMPLIANCE 🚨
================================================================================
You MUST strictly adhere to the Channel's Voiceover Narration Rules below.
Do NOT contradict, skip, or soften any of these instructions.

[CHANNEL: ${channelProfile?.name || "Active Channel"} — NICHE: ${channelProfile?.niche || "General"}]

[SCRIPT NARRATION RULES (MANDATORY)]:
"""
${scriptOnlyCoreRules || "Deliver an authentic, highly engaging YouTube documentary voiceover narrative."}
"""

${additionalScriptRules ? `[ADDITIONAL SCRIPT RULES (MANDATORY)]:\n"""\n${additionalScriptRules}\n"""\n` : ""}
${channelProfile?.narrationStyle ? `[CHANNEL NARRATION STYLE]: ${channelProfile.narrationStyle}\n` : ""}
${channelProfile?.scriptStyle ? `[CHANNEL SCRIPTWRITING & HOOK FORMULA]: ${channelProfile.scriptStyle}\n` : ""}
================================================================================`;

    // User Custom Directives
    const userDirectives = customScriptPrompt
      ? `\n### USER SPECIFIC SCRIPT INSTRUCTIONS:
"""
${customScriptPrompt}
"""`
      : "";

    let prompt = "";
    if (action && action !== "generate" && currentScript) {
      prompt = `You are a master YouTube narrative scriptwriter and voiceover director.
Perform the requested editing action ("${action}") on the existing narration script below.

${langDirective}

Selected Video Concept:
- Title: ${effectiveConcept.title}
- Premise: ${effectiveConcept.premise}
- Main Hook: ${effectiveConcept.mainHook || ""}
- Story Structure: ${effectiveConcept.storyStructure || ""}
- Climax / Payoff: ${effectiveConcept.payoff || ""}

${channelContext}
${userDirectives}

${selectedText ? `TARGET SELECTION TO MODIFY:\n"""${selectedText}"""\n` : ""}

CURRENT SCRIPT TO REFINE:
"""
${currentScript}
"""

================================================================================
🚨 CRITICAL DIRECTIVE: RETURN ONLY THE PURE SPOKEN VOICEOVER NARRATION 🚨
================================================================================
1. Deliver ONLY the pure spoken voice-over narration text, formatted into natural readable paragraphs.
2. ABSOLUTELY NO image prompts, scene prompts, visual descriptions, camera instructions, or thumbnail rules!
3. ABSOLUTELY NO [Scene X] tags, scene numbers, or [صورة / مشهد] markers.
4. ABSOLUTELY NO speaker labels like "Narrator:", "Voiceover:", or "الراوي:".
5. ABSOLUTELY NO markdown headings like "# Scene 1" or "## Act 1".
6. The output must be 100% spoken narration words, ready for the voice actor or text-to-speech to read aloud.
7. Use subtle "..." pauses where appropriate for natural voice-over delivery.
================================================================================`;
    } else {
      prompt = `You are an elite YouTube documentary and narrative scriptwriter. Write a complete, full-length, original voice-over narration script based on the exact project parameters and rules below.

${langDirective}

### VIDEO CONCEPT DETAILS:
- Title: ${effectiveConcept.title}
- Premise: ${effectiveConcept.premise}
- Niche & Category: ${effectiveConcept.niche || channelProfile?.niche || "Documentary"} (${effectiveConcept.subNiche || ""})
- Target Audience: ${effectiveConcept.targetAudience || analysis?.targetAudience || "General audience"}
- Opening Hook Formula: ${effectiveConcept.mainHook || "Gripping paradox or curiosity gap in first 15 seconds"}
- Narrative Structure: ${effectiveConcept.storyStructure || "4-act narrative structure"}
- Ending Payoff: ${effectiveConcept.payoff || "Thoughtful concluding resolution"}

${channelContext}
${userDirectives}

### PRODUCTION SPECS:
- Target Duration: ${targetDurationMinutes || 12} minutes
- Target Script Length: Approximately ${targetWords} words (at ~145 words/minute voiceover pace)

================================================================================
🚨 CRITICAL DIRECTIVE: ONLY PURE SPOKEN VOICEOVER NARRATION TEXT (MANDATORY) 🚨
================================================================================
The user requires ONLY the voice-over narration script (نص التعليق الصوتي المقروء فقط).
DO NOT include any visual directions or image generation prompts!

STRICT RULES:
1. Deliver ONLY the continuous spoken voice-over narration text in natural paragraphs.
2. ABSOLUTELY NO image prompts, prompts for image generation, or visual descriptions (لا تكتب أي برومبت للصور أو وصف بصري).
3. ABSOLUTELY NO [Scene 1], [Shot 1], [مشهد 1], or scene marker brackets.
4. ABSOLUTELY NO "Image Prompt:", "Visual:", "Prompt:", "Thumbnail:", "صورة:", "برومبت:".
5. ABSOLUTELY NO speaker tags like "Narrator:", "Voiceover:", "الراوي:", "المعلق:".
6. ABSOLUTELY NO markdown section headers like "# Act 1" or "## Chapter 1".
7. Open immediately with an irresistible curiosity hook within the first 15 seconds.
8. Use natural transitions between thoughts, with occasional "..." for dramatic narration pauses.
9. Deliver a deeply satisfying climax and final takeaway.
================================================================================`;
    }

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const scriptText = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt,
      });
      const cleaned = cleanVoiceoverScriptOnly(scriptText || "");
      return res.json({ script: cleaned });
    }

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: prompt,
          config: buildGeminiTextConfig(modelToUse),
        }),
      req.body
    );

    const cleaned = cleanVoiceoverScriptOnly(response.text || "");
    res.json({
      script: cleaned,
      _usedModel: (response as any)._usedModel,
      _initialModel: (response as any)._initialModel,
      _modelSwitched: (response as any)._modelSwitched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Script generation failed." });
  }
});

// 5. Generate Voice-Over Audio via Gemini TTS or CodeCraft OpenAI-Compatible Audio Speech API
app.post("/api/ai/generate-tts", async (req, res) => {
  try {
    const {
      text,
      voiceName = "Kore",
      provider: requestedProvider,
    } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Script text is required for voice-over generation." });
    }
    const provider = resolveEffectiveProvider(requestedProvider, req.body);
    const excerpt = text.slice(0, 4096);

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      if (!cc.apiKey) {
        return res.status(400).json({
          error: "CodeCraft API key is not configured for TTS. Add CODECRAFT_API_KEY in Vercel Environment Variables or Settings.",
        });
      }
      const chosenVoice = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(
        String(voiceName).toLowerCase()
      )
        ? String(voiceName).toLowerCase()
        : cc.ttsVoice || "alloy";

      const ttsRes = await fetch(`${cc.baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cc.apiKey}`,
        },
        body: JSON.stringify({
          model: cc.ttsModel || "tts-1",
          input: excerpt,
          voice: chosenVoice,
          response_format: "mp3",
        }),
      });

      if (!ttsRes.ok) {
        const errData = await ttsRes.json().catch(() => ({}));
        throw new Error(
          errData?.error?.message ||
            errData?.error ||
            `CodeCraft TTS endpoint (/audio/speech) returned status ${ttsRes.status}`
        );
      }
      const arrayBuffer = await ttsRes.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");
      const contentType = ttsRes.headers.get("content-type") || "audio/mpeg";
      return res.json({
        audioBase64: base64Audio,
        audioDataUrl: `data:${contentType};base64,${base64Audio}`,
        mimeType: contentType,
        voiceUsed: chosenVoice,
        providerUsed: "codecraft",
      });
    }

    const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
    const chosenVoice = validVoices.includes(voiceName) ? voiceName : "Kore";

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: [
            {
              role: "user",
              parts: [{ text: excerpt }],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: chosenVoice },
              },
            },
          },
        }),
      req.body,
      undefined,
      ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"]
    );

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("TTS model did not return audio data.");
    }
    res.json({
      audioBase64: base64Audio,
      audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
      mimeType: "audio/wav",
      voiceUsed: chosenVoice,
      providerUsed: "gemini",
      modelUsed: (response as any)._usedModel || "gemini-3.8-flash-lite-tts",
      modelSwitched: (response as any)._modelSwitched || false,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Voice-over generation failed." });
  }
});

// 5b. Generate Actual Scene Image via CodeCraft Image API (/images/generations) or Gemini Image Model
app.post("/api/ai/generate-scene-image", async (req, res) => {
  try {
    const {
      prompt,
      aspectRatio = "16:9",
      provider: requestedProvider = "codecraft",
    } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Image prompt is required." });
    }

    const provider = resolveEffectiveProvider(requestedProvider, req.body);

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      if (!cc.apiKey) {
        return res.status(400).json({
          error: "CodeCraft API key is not configured. Configure it in Settings > CodeCraft API or set CODECRAFT_API_KEY in Vercel.",
        });
      }
      const size = aspectRatio === "9:16" ? "1024x1792" : "1792x1024";
      const imgRes = await fetch(`${cc.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cc.apiKey}`,
        },
        body: JSON.stringify({
          model: cc.imageModel || "dall-e-3",
          prompt,
          n: 1,
          size,
          response_format: "b64_json",
        }),
      });

      const imgData = await imgRes.json().catch(() => ({}));
      if (!imgRes.ok) {
        throw new Error(
          imgData?.error?.message ||
            imgData?.error ||
            `CodeCraft Image Generation failed (${imgRes.status})`
        );
      }

      const item = imgData?.data?.[0];
      if (item?.b64_json) {
        return res.json({
          imageBase64: item.b64_json,
          imageDataUrl: `data:image/png;base64,${item.b64_json}`,
          mimeType: "image/png",
          providerUsed: "codecraft",
        });
      }
      if (item?.url) {
        const fetched = await fetch(item.url);
        const buf = Buffer.from(await fetched.arrayBuffer());
        const b64 = buf.toString("base64");
        const mime = fetched.headers.get("content-type") || "image/png";
        return res.json({
          imageBase64: b64,
          imageDataUrl: `data:${mime};base64,${b64}`,
          mimeType: mime,
          providerUsed: "codecraft",
        });
      }
      throw new Error("CodeCraft API did not return an image payload.");
    }

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) => {
        const imageConfig: Record<string, any> = {
          aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
        };
        if (modelToUse.includes("banana") || modelToUse.includes("pro-image")) {
          imageConfig.imageSize = "1K";
        }
        return ai.models.generateContent({
          model: modelToUse,
          contents: { parts: [{ text: prompt }] },
          config: { imageConfig },
        });
      },
      req.body,
      undefined,
      ["gemini-3.1-flash-lite-image", "gemini-nano-banana-2.1", "gemini-3-pro-image"]
    );
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/png";
        return res.json({
          imageBase64: part.inlineData.data,
          imageDataUrl: `data:${mime};base64,${part.inlineData.data}`,
          mimeType: mime,
          providerUsed: "gemini",
          modelUsed: (response as any)._usedModel || "gemini-3.1-flash-lite-image",
          modelSwitched: (response as any)._modelSwitched || false,
        });
      }
    }
    throw new Error("Image model did not return an inline image.");
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Scene image generation failed." });
  }
});

// 6. Scene Breakdown (Variable, Script-Driven Scene Durations Synchronized with Real Audio)
app.post("/api/ai/scene-breakdown", async (req, res) => {
  try {
    const {
      script,
      actualDurationSec,
      concept,
      visualStylePreset,
      channelProfile,
      provider: requestedProvider,
    } = req.body || {};
    if (!script || typeof script !== "string") {
      return res.status(400).json({ error: "Approved script is required for scene breakdown." });
    }
    const provider = resolveEffectiveProvider(requestedProvider, req.body);
    const totalSec = Math.max(10, Number(actualDurationSec) || 180);
    const scriptWords = script.trim().split(/\s+/).filter(Boolean);
    const totalWordCount = scriptWords.length;

    const byDuration = Math.round(totalSec / 5.2);
    const byWords = Math.round(totalWordCount / 14);
    const targetSceneCount = Math.max(8, Math.min(120, Math.max(byDuration, byWords)));
    const maxWordsPerScene = Math.max(16, Math.ceil((totalWordCount / targetSceneCount) * 1.65));

    const corePromptRules = channelProfile?.promptRules || channelProfile?.visualStyleRules || "";
    const prompt = `Split the following approved voice-over script into a natural, dynamically-paced sequence of visual scenes synchronized with the narration.

🚨 MANDATORY CHANNEL CORE PROMPT RULES & VISUAL INSTRUCTIONS:
- Channel: ${channelProfile?.name || "Active Channel"} (${channelProfile?.niche || "General"})
- Core Prompt Rules (Strict Compliance): ${corePromptRules || "Cinematic documentary visual storytelling"}
- Additional Scene & Visual Rules: ${channelProfile?.additionalSceneRules || ""}
- Locked Visual Art Style: ${channelProfile?.visualStyleRules || visualStylePreset?.name || "Cinematic Documentary"} (${visualStylePreset?.rules || ""})
${channelProfile?.avatarCharacterDesc ? `- Channel Host / Avatar Character: ${channelProfile.avatarCharacterDesc}` : ""}
${channelProfile?.motionStyle ? `- Channel Motion & Transition Style: ${channelProfile.motionStyle}` : ""}
Total Authoritative Audio Duration: ${totalSec} seconds (${totalWordCount} words).
Target Scene Count: Approximately ${targetSceneCount} scenes.

APPROVED SCRIPT:
"""
${script}
"""

CRITICAL DYNAMIC TIMING & CONTINUITY RULES:
1. VARIABLE SCENE DURATIONS (NOT FIXED): Do NOT make every scene the same length! Let the natural meaning, dramatic beats, punctuation, and sentence structure of the script dictate each scene's length:
   - Short, punchy hooks, quick reveals, or fast action beats should be brief excerpts (e.g., 5–10 words, lasting ~2.5s to 4.5s).
   - Deep explanations, emotional pauses, or atmospheric establishing beats should be longer excerpts (e.g., 15–26 words, lasting ~5.5s to 9.5s).
2. Generate approximately ${targetSceneCount} scenes in total.
3. Every scene must correspond to a contiguous excerpt of the approved script. Taken together in order, the scene scriptExcerpt fields MUST cover 100% of the script with no missing sentences and no duplicated text.
4. Provide a vivid visualDescription, mainSubject, environment, emotionalTone, cameraFraming ("wide shot", "medium shot", "close-up", "aerial establishing shot", "low-angle shot", "over-the-shoulder"), and transitionSuggestion ("cut", "fade", "wipeleft", "CrossZoom", "ZoomIn", etc.) for every scene.`;

    let rawScenes: any[] = [];
    let geminiResponse: any = null;

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const rawJson = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt: `${prompt}\n\nReturn strictly valid JSON with key "scenes" containing an array of ~${targetSceneCount} scene objects with: scriptExcerpt, visualDescription, mainSubject, environment, emotionalTone, cameraFraming, transitionSuggestion.`,
        jsonMode: true,
      });
      const parsed = parseJsonClean(rawJson);
      rawScenes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.scenes)
        ? parsed.scenes
        : Array.isArray(parsed?.data)
        ? parsed.data
        : [];
    } else {
      geminiResponse = await executeGeminiWithFailover(
        (ai, _kIdx, _tot, modelToUse) =>
          ai.models.generateContent({
            model: modelToUse,
            contents: prompt,
            config: buildGeminiTextConfig(modelToUse, {
              responseMimeType: "application/json",
              responseSchema: {
              type: Type.OBJECT,
              properties: {
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      scriptExcerpt: { type: Type.STRING },
                      visualDescription: { type: Type.STRING },
                      mainSubject: { type: Type.STRING },
                      environment: { type: Type.STRING },
                      emotionalTone: { type: Type.STRING },
                      cameraFraming: { type: Type.STRING },
                      transitionSuggestion: { type: Type.STRING },
                    },
                    required: ["scriptExcerpt", "visualDescription"],
                  },
                },
              },
              required: ["scenes"],
            },
          }),
        }),
        req.body
      );
      const parsed = parseJsonClean(geminiResponse.text || "{}");
      rawScenes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.scenes)
        ? parsed.scenes
        : [];
    }

    if (!rawScenes.length) {
      rawScenes = [
        {
          scriptExcerpt: script,
          visualDescription: `${concept?.title || "Cinematic documentary scene"} — ${
            channelProfile?.visualStyleRules || visualStylePreset?.name || "high detail visual"
          }`,
          mainSubject: concept?.title || "Narrator subject",
          environment: "Cinematic environment",
          emotionalTone: "Engaging",
          cameraFraming: "wide shot",
          transitionSuggestion: "fade",
        },
      ];
    }

    const balancedScenes: any[] = [];
    const framingsCycle = ["wide shot", "medium shot", "close-up", "low-angle shot", "over-the-shoulder", "aerial shot"];
    for (const sc of rawScenes) {
      const excerpt = String(sc.scriptExcerpt || "").trim();
      const words = excerpt.split(/\s+/).filter(Boolean);
      if (words.length > maxWordsPerScene && words.length >= 25) {
        const sentences = excerpt
          .split(/(?<=[.!?؟،,;:])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);

        if (sentences.length > 1) {
          let buf: string[] = [];
          let bufWords = 0;
          for (const sent of sentences) {
            const sLen = sent.split(/\s+/).filter(Boolean).length;
            if (bufWords > 0 && bufWords + sLen > 18) {
              balancedScenes.push({
                ...sc,
                scriptExcerpt: buf.join(" "),
                cameraFraming: framingsCycle[balancedScenes.length % framingsCycle.length],
              });
              buf = [sent];
              bufWords = sLen;
            } else {
              buf.push(sent);
              bufWords += sLen;
            }
          }
          if (buf.length > 0) {
            balancedScenes.push({
              ...sc,
              scriptExcerpt: buf.join(" "),
              cameraFraming: framingsCycle[balancedScenes.length % framingsCycle.length],
            });
          }
        } else {
          const pattern = [9, 15, 12, 18, 11];
          let idx = 0;
          let step = 0;
          while (idx < words.length) {
            const size = pattern[step % pattern.length];
            const slice = words.slice(idx, idx + size).join(" ");
            balancedScenes.push({
              ...sc,
              scriptExcerpt: slice,
              cameraFraming: framingsCycle[(balancedScenes.length + step) % framingsCycle.length],
            });
            idx += size;
            step++;
          }
        }
      } else {
        balancedScenes.push(sc);
      }
    }

    const finalRawScenes = balancedScenes.length ? balancedScenes : rawScenes;

    const sceneWeights = finalRawScenes.map((s: any) => {
      const txt = String(s.scriptExcerpt || "").trim();
      const wordCount = Math.max(1, txt.split(/\s+/).filter(Boolean).length);
      const pauseMarks = (txt.match(/(\.\.\.|[.!?؟،—;:]+)/g) || []).length;
      const charFactor = Math.max(1, txt.length / 5.2);
      return wordCount * 0.65 + charFactor * 0.35 + pauseMarks * 0.85;
    });
    const totalWeight = sceneWeights.reduce((a: number, b: number) => a + b, 0) || 1;

    let cursor = 0;
    const minSceneDur = Math.max(1.8, Math.min(10, totalSec / finalRawScenes.length));
    const timedScenes = finalRawScenes.map((s: any, idx: number) => {
      const isLast = idx === finalRawScenes.length - 1;
      const startSec = idx === 0 ? 0 : Math.max(+(idx * 1.5).toFixed(1), cursor);
      const rawDur = (sceneWeights[idx] / totalWeight) * totalSec;
      const durationSec = isLast
        ? Math.max(1.5, +(totalSec - startSec).toFixed(1))
        : Math.max(minSceneDur, +rawDur.toFixed(1));
      const endSec = isLast ? totalSec : +(startSec + durationSec).toFixed(1);
      cursor = endSec;
      return {
        id: `scene_${Date.now()}_${idx + 1}`,
        sceneNumber: idx + 1,
        scriptExcerpt: s.scriptExcerpt,
        startTime: startSec,
        endTime: endSec,
        duration: isLast ? Math.max(1.0, +(totalSec - startSec).toFixed(1)) : durationSec,
        visualDescription: s.visualDescription,
        mainSubject: s.mainSubject,
        environment: s.environment,
        emotionalTone: s.emotionalTone,
        cameraFraming: s.cameraFraming || "medium shot",
        transitionSuggestion: s.transitionSuggestion || channelProfile?.editorConfig?.transitionType || "fade",
      };
    });

    res.json({
      scenes: timedScenes,
      _usedModel: geminiResponse?._usedModel,
      _initialModel: geminiResponse?._initialModel,
      _modelSwitched: geminiResponse?._modelSwitched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Scene breakdown failed." });
  }
});

// 7. Generate Standalone Image Prompts (Fast Parallel Batching + Low Latency Thinking)
app.post("/api/ai/image-prompts", async (req, res) => {
  try {
    const {
      scenes,
      script,
      visualStyleLock,
      visualStylePreset,
      channelProfile,
      aspectRatio = "16:9",
      negativePrompt = "no text in this frame, no watermarks, no logos",
      provider: requestedProvider,
    } = req.body || {};
    if (!Array.isArray(scenes) || !scenes.length) {
      return res.status(400).json({ error: "Scenes array is required to generate image prompts." });
    }

    const provider = resolveEffectiveProvider(requestedProvider, req.body);
    const effectiveAspect = channelProfile?.aspectRatio || aspectRatio || "16:9";

    const formatTimestampTag = (sec: number, sceneIdx: number = 0) => {
      let total = Math.max(0, Math.round(sec || 0));
      if (sceneIdx > 0 && total === 0) {
        total = Math.max(1, sceneIdx * 2);
      }
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}-${String(s).padStart(2, "0")}`;
    };

    const formatClockTime = (sec: number, sceneIdx: number = 0) => {
      let total = Math.max(0, Math.round(sec || 0));
      if (sceneIdx > 0 && total === 0) {
        total = Math.max(1, sceneIdx * 2);
      }
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const corePromptRules = channelProfile?.promptRules || channelProfile?.visualStyleRules || "";
    const additionalSceneRules = channelProfile?.additionalSceneRules || "";
    const artStyleRules = channelProfile?.visualStyleRules || channelProfile?.promptRules || visualStyleLock?.artStyle || "Cinematic visual storytelling";
    const avatarRules = channelProfile?.avatarCharacterDesc || visualStyleLock?.characterRules || "";

    const buildChunkPrompt = (sceneChunk: any[]) => `You are an elite visual prompt engineer specialized in Midjourney v6, Flux.1, and Stable Diffusion XL.
Generate one highly detailed, standalone image prompt for each scene below.

================================================================================
🚨 SUPREME PRIORITY DIRECTIVE: REPLICATE CHANNEL VISUAL STYLE & UPLOADED REFERENCES 🚨
================================================================================
The user has selected channel "${channelProfile?.name || "Active Channel"}" and established Core Prompt Rules and visual references.
YOUR HIGHEST TASK is to ensure that EVERY image prompt you generate replicates and embeds the exact visual art style, rendering medium, texture, and aesthetic from the Channel's Core Prompt Rules and the uploaded reference images!

[1. CHANNEL CORE PROMPT RULES (MANDATORY & ABSOLUTE COMPLIANCE)]:
"""
${corePromptRules || "High-end visual aesthetic matching channel branding."}
"""

[2. ADDITIONAL SCENE & IMAGE RULES (MANDATORY)]:
"""
${additionalSceneRules || "Dynamic cinematic camera framing with storytelling focus."}
"""

[3. ART STYLE & MEDIUM TO REPLICATE]:
"""
${artStyleRules}
"""

${avatarRules ? `[4. CHANNEL AVATAR / CHARACTER VISUAL CONTINUITY]:\n"""\n${avatarRules}\n"""\n` : ""}

[5. COLOR PALETTE, LIGHTING & CAMERA COMPOSITION]:
- Lighting & Shadows: ${visualStyleLock?.lighting || "Volumetric cinematic lighting with high contrast and rim light"}
- Color Palette: ${visualStyleLock?.colorPalette || "Rich atmospheric tones conforming to channel palette"}
- Aspect Ratio: --ar ${effectiveAspect}
- Negative Prompt Constraints: ${negativePrompt}

[6. VISUAL REFERENCE IMAGES INSTRUCTION]:
Examine any attached reference images. Note their exact rendering technique (e.g. 2D dark anime, 3D hyperreal render, moody noir oil painting, vintage graphic novel, or 35mm film photography), linework, brushwork, lighting contrasts, and atmosphere.
EVERY prompt you output MUST reflect this exact visual DNA! Do NOT use generic stock descriptions like 'a picture of' or 'cinematic style' without the specific style tokens!

================================================================================
${
  script
    ? `NARRATION SCRIPT CONTEXT:\n"""\n${String(script).slice(0, 1600)}\n"""\n`
    : ""
}
SCENES TO CREATE PROMPTS FOR:
${sceneChunk
  .map(
    (s: any) =>
      `Scene ${s.sceneNumber} (ID: ${s.id}, Scene Tag: "${s.sceneNumber}-#${formatTimestampTag(s.startTime, s.sceneNumber - 1)}", Timing: ${formatClockTime(s.startTime, s.sceneNumber - 1)}, Duration: ${s.duration}s, Framing: ${s.cameraFraming}):
Script Excerpt: "${s.scriptExcerpt}"
Visual Description: ${s.visualDescription}
Main Subject: ${s.mainSubject || ""}
Environment: ${s.environment || ""}`
  )
  .join("\n\n")}
================================================================================

CRITICAL STANDALONE PROMPT FORMATTING & TIMESTAMPS:
1. Every prompt must be 100% self-contained so that when entered into Midjourney, Flux, or Stable Diffusion, it produces an image in the EXACT style of the channel.
2. In each prompt, start with the EXACT scene tag provided:
   [sceneNumber]-#[timestamp] [cameraFraming], [vivid subject action and environment], [exact channel art style, rendering medium, and aesthetic keywords from Core Prompt Rules and reference images], [specific volumetric lighting, shadows, and color palette], no text in this frame, --ar ${effectiveAspect}
3. 🚨 NEVER REPEAT 0.00 OR 0-00: Each scene MUST have its own individual timestamp matching its specific start time (e.g. Scene 1 uses 1-#0-00, Scene 2 uses 2-#${formatTimestampTag(sceneChunk[1]?.startTime || 4, 1)}, Scene 3 uses 3-#${formatTimestampTag(sceneChunk[2]?.startTime || 8, 2)}). Do NOT output 0.00 across all scenes!`;

    const CHUNK_SIZE = 10;
    const chunks: any[][] = [];
    for (let i = 0; i < scenes.length; i += CHUNK_SIZE) {
      chunks.push(scenes.slice(i, i + CHUNK_SIZE));
    }

    const firstRefImg =
      channelProfile?.styleReferenceImages?.[0] || channelProfile?.avatarImages?.[0] || null;

    let rawPrompts: any[] = [];
    let anySwitched = false;
    let effectiveUsedModel: string | undefined = undefined;
    let effectiveInitialModel: string | undefined = undefined;
    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const chunkResults = await Promise.all(
        chunks.map(async (chunk) => {
          const rawJson = await callCodeCraftChat({
            apiKey: cc.apiKey,
            baseUrl: cc.baseUrl,
            model: cc.textModel,
            prompt: `${buildChunkPrompt(chunk)}\n\nReturn strictly valid JSON with key "prompts" (array of objects with sceneId, sceneNumber, timestampTag, prompt).`,
            imageBase64: firstRefImg?.dataUrl || null,
            imageMime: firstRefImg?.mimeType || "image/jpeg",
            jsonMode: true,
          });
          const parsed = parseJsonClean(rawJson);
          return Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.prompts)
            ? parsed.prompts
            : [];
        })
      );
      rawPrompts = chunkResults.flat();
    } else {
      const imageParts: any[] = [];
      for (const img of (channelProfile?.styleReferenceImages || []).slice(0, 3)) {
        if (img?.dataUrl) {
          const cleanB64 = String(img.dataUrl).replace(/^data:[^;]+;base64,/, "");
          imageParts.push({
            inlineData: { data: cleanB64, mimeType: img.mimeType || "image/jpeg" },
          });
        }
      }
      for (const img of (channelProfile?.avatarImages || []).slice(0, 1)) {
        if (img?.dataUrl) {
          const cleanB64 = String(img.dataUrl).replace(/^data:[^;]+;base64,/, "");
          imageParts.push({
            inlineData: { data: cleanB64, mimeType: img.mimeType || "image/jpeg" },
          });
        }
      }

      const chunkResults = await Promise.all(
        chunks.map(async (chunk, chunkIdx) => {
          const parts: any[] = [];
          if (imageParts.length > 0) {
            parts.push({
              text: `=== ATTACHED CHANNEL VISUAL REFERENCE IMAGES (${imageParts.length} IMAGE(S)) ===
These attached reference images define the official visual identity and art style of the channel "${channelProfile?.name || "Active Channel"}".
Observe their art medium, linework, color palette, lighting mood, and rendering texture.
You MUST replicate and incorporate these exact visual characteristics into EVERY scene prompt below:`,
            });
            parts.push(...imageParts);
          }
          parts.push({ text: buildChunkPrompt(chunk) });
          const response = await executeGeminiWithFailover(
            (ai, _kIdx, _tot, modelToUse) => {
              return ai.models.generateContent({
                model: modelToUse,
                contents: [{ role: "user", parts }],
                config: buildGeminiTextConfig(modelToUse, {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      prompts: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            sceneId: { type: Type.STRING },
                            sceneNumber: { type: Type.INTEGER },
                            timestampTag: { type: Type.STRING },
                            prompt: { type: Type.STRING },
                          },
                          required: ["sceneId", "sceneNumber", "timestampTag", "prompt"],
                        },
                      },
                    },
                    required: ["prompts"],
                  },
                }),
              });
            },
            req.body,
            (Number(req.body?.parallelWorkerIdx) || 0) + chunkIdx
          );
          const parsed = parseJsonClean(response.text || "{}");
          const arr = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.prompts)
            ? parsed.prompts
            : [];
          return {
            prompts: arr,
            _usedModel: (response as any)._usedModel,
            _initialModel: (response as any)._initialModel,
            _modelSwitched: (response as any)._modelSwitched,
          };
        })
      );
      rawPrompts = chunkResults.flatMap((c: any) => c.prompts || []);
      const switched = chunkResults.find((c: any) => c._modelSwitched);
      if (switched) {
        anySwitched = true;
        effectiveUsedModel = switched._usedModel;
        effectiveInitialModel = switched._initialModel;
      } else if (chunkResults[0]?._usedModel) {
        effectiveUsedModel = chunkResults[0]._usedModel;
        effectiveInitialModel = chunkResults[0]._initialModel;
      }
    }

    const finalPrompts = scenes.map((s: any, idx: number) => {
      const found =
        rawPrompts.find((p: any) => p.sceneId === s.id || p.sceneNumber === s.sceneNumber) ||
        rawPrompts[idx];
      const tsTag = formatTimestampTag(s.startTime, idx);
      const clockTag = formatClockTime(s.startTime, idx);
      const requiredHeader = `${s.sceneNumber}-#${tsTag}`;

      let promptBody = String(found?.prompt || "").trim();
      if (promptBody) {
        // Strip any hallucinated duplicate #0.00, #0-00, or scene prefix
        promptBody = promptBody
          .replace(/^(?:Scene\s*\d+\s*[:\-—]?\s*)?(?:\[?\d+[-_#:]+[\d.:-]+\]?|\d+[-_#:]+[\d.:-]+|#[\d.:-]+|\b\d+[:.]\d{2}\b|\b0\.00\b|\b0-00\b)\s*[:\-—,]?\s*/i, "")
          .trim();
      }

      if (!promptBody) {
        const artRules =
          channelProfile?.visualStyleRules ||
          channelProfile?.promptRules ||
          visualStyleLock?.artStyle ||
          visualStylePreset?.name ||
          "Cinematic illustration";
        promptBody = `${s.cameraFraming || "medium shot"}, ${
          s.visualDescription || s.scriptExcerpt
        }, ${channelProfile?.avatarCharacterDesc || ""}, ${artRules}, ${
          visualStyleLock?.lighting || "cinematic lighting"
        }, ${negativePrompt}, --ar ${effectiveAspect}`;
      }

      const finalPromptText = `${requiredHeader} ${promptBody}`;

      return {
        sceneId: s.id,
        sceneNumber: s.sceneNumber,
        timestampTag: tsTag,
        clockTime: clockTag,
        startTime: s.startTime,
        duration: s.duration,
        prompt: finalPromptText,
      };
    });

    res.json({
      prompts: finalPrompts,
      _usedModel: effectiveUsedModel,
      _initialModel: effectiveInitialModel,
      _modelSwitched: anySwitched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate image prompts." });
  }
});

// 8. Generate One-to-One Motion Prompts
app.post("/api/ai/motion-prompts", async (req, res) => {
  try {
    const { scenes, imagePrompts, channelProfile, provider: requestedProvider } = req.body || {};
    if (!Array.isArray(scenes) || !scenes.length) {
      return res.status(400).json({ error: "Scenes are required to generate motion prompts." });
    }

    const provider = resolveEffectiveProvider(requestedProvider, req.body);

    const prompt = `Generate exactly one subtle, cinematic motion prompt for each scene and its corresponding image prompt below.
${channelProfile?.motionStyle || channelProfile?.promptRules ? `\nCHANNEL MOTION & CAMERA STYLE RULES:\n${channelProfile.motionStyle || ""}\n${channelProfile.promptRules || ""}\n` : ""}
RULES FOR MOTION PROMPTS:
- Describe subtle camera behavior (e.g., slow cinematic push-in, gentle camera pan, subtle parallax) and natural environmental motion (moving particles, soft light shifts, gentle breeze).
- Explicitly state that the motion preserves the original image's character identity, clothing, composition, objects, color palette, art style, and main subject placement.
- Never introduce new objects, character redesigns, distortion, or unrequested text.
- Also suggest an editorMotion ("zoomin" or "zoomout") for the timeline Ken Burns engine.

SCENES & IMAGE PROMPTS:
${scenes
  .map((s: any) => {
    const ip = (imagePrompts || []).find((p: any) => p.sceneId === s.id);
    return `Scene ${s.sceneNumber} (sceneId: ${s.id}):
Visual: ${s.visualDescription}
Image Prompt: ${ip?.prompt || s.visualDescription}`;
  })
  .join("\n\n")}`;

    let rawMotions: any[] = [];
    let geminiResponse: any = null;
    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const rawJson = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt: `${prompt}\n\nReturn strictly valid JSON with key "motionPrompts" (array of objects with sceneId, sceneNumber, prompt, editorMotion).`,
        jsonMode: true,
      });
      const parsed = parseJsonClean(rawJson);
      rawMotions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.motionPrompts)
        ? parsed.motionPrompts
        : [];
    } else {
      geminiResponse = await executeGeminiWithFailover(
        (ai, _kIdx, _tot, modelToUse) =>
          ai.models.generateContent({
            model: modelToUse,
            contents: prompt,
            config: buildGeminiTextConfig(modelToUse, {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  motionPrompts: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        sceneId: { type: Type.STRING },
                        sceneNumber: { type: Type.INTEGER },
                        prompt: { type: Type.STRING },
                        editorMotion: { type: Type.STRING },
                      },
                      required: ["sceneId", "sceneNumber", "prompt", "editorMotion"],
                    },
                  },
                },
                required: ["motionPrompts"],
              },
            }),
          }),
        req.body,
        req.body?.parallelWorkerIdx
      );

      const parsed = parseJsonClean(geminiResponse.text || "{}");
      rawMotions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.motionPrompts)
        ? parsed.motionPrompts
        : [];
    }

    const finalMotions = scenes.map((s: any, idx: number) => {
      const found =
        rawMotions.find((m: any) => m.sceneId === s.id || m.sceneNumber === s.sceneNumber) ||
        rawMotions[idx];
      return {
        sceneId: s.id,
        sceneNumber: s.sceneNumber,
        prompt:
          found?.prompt ||
          `Slow cinematic camera ${idx % 2 === 0 ? "push-in" : "pull-out"} on ${
            s.mainSubject || "the scene"
          } with subtle atmospheric light motion, strictly preserving character identity, composition, and visual style.`,
        editorMotion: found?.editorMotion || (idx % 2 === 0 ? "zoomin" : "zoomout"),
      };
    });

    res.json({
      motionPrompts: finalMotions,
      _usedModel: geminiResponse?._usedModel,
      _initialModel: geminiResponse?._initialModel,
      _modelSwitched: geminiResponse?._modelSwitched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate motion prompts." });
  }
});

// Guarantee that the suggested text overlay is completely embedded INSIDE the image generation prompt
// so the user can copy the prompt directly into Midjourney, Flux, Ideogram, or DALL-E to generate the thumbnail with text
export function ensureOverlayTextInPrompt(visualPrompt: string, suggestedText: string): string {
  if (!suggestedText || !String(suggestedText).trim()) return visualPrompt || "";
  const cleanText = String(suggestedText)
    .trim()
    .replace(/^["'«“\[\s]+|["'»”\]\s]+$/g, "")
    .trim();
  if (!cleanText) return visualPrompt || "";

  if (!visualPrompt || !String(visualPrompt).trim()) {
    return `Viral high-CTR YouTube thumbnail, featuring bold high-impact typography text overlay reading "${cleanText}" in large vibrant YouTube thumbnail font with strong contrast and drop shadow, cinematic dramatic lighting, 8k resolution, --ar 16:9`;
  }

  const promptStr = String(visualPrompt).trim();
  // If the suggested text is already clearly mentioned in the prompt, keep it
  if (promptStr.toLowerCase().includes(cleanText.toLowerCase())) {
    return promptStr;
  }

  const textClause = `featuring bold, high-contrast typography text overlay reading "${cleanText}" in large dynamic YouTube thumbnail font with subtle drop shadow`;

  if (/--ar\s+[0-9:]+/i.test(promptStr)) {
    return promptStr.replace(/(--ar\s+[0-9:]+)/i, `${textClause}, $1`).replace(/,\s*,/g, ", ");
  }
  return `${promptStr}, ${textClause}, --ar 16:9`;
}

export function sanitizeHashtags(rawHashtags: any[], niche: string = "", title: string = "", language: string = ""): string[] {
  let list: string[] = [];
  if (Array.isArray(rawHashtags)) {
    list = rawHashtags.flatMap((h) => String(h || "").split(/[\s,]+/)).filter(Boolean);
  } else if (typeof rawHashtags === "string") {
    list = (rawHashtags as string).split(/[\s,]+/).filter(Boolean);
  }

  // Normalize: ensure leading '#', strip brackets, quotes, trailing commas/periods
  list = list
    .map((tag) => {
      let clean = String(tag || "")
        .replace(/^[#\s"'«“\[\(]+|[#\s"'»”\]\),;.:]+$/g, "")
        .replace(/#/g, "")
        .replace(/[^\w\u0600-\u06FF]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .trim();
      return clean ? `#${clean}` : "";
    })
    .filter(Boolean);

  // Remove duplicates while preserving original order
  const uniqueList = Array.from(new Set(list));

  const isArabic = /[\u0600-\u06FF]/.test(
    `${niche} ${title} ${language} ${uniqueList.join(" ")}`
  );

  const fallbackArabicTags = [
    "#وثائقي",
    "#قصص",
    "#غموض",
    "#حقائق",
    "#معلومات",
    "#يوتيوب",
    "#اكسبلور",
    "#ترند",
    "#تاريخ",
    "#أسرار",
    "#استكشاف",
    "#قصة_حقيقية",
    "#فيديو",
    "#تحقيق",
    "#شاهد",
    "#معرفة",
    "#عالم_الغموض",
  ];

  const fallbackEnglishTags = [
    "#Documentary",
    "#Mystery",
    "#YouTube",
    "#ViralVideo",
    "#Trending",
    "#DeepDive",
    "#MustWatch",
    "#Storytelling",
    "#History",
    "#Secrets",
    "#Explain",
    "#Cinematic",
    "#DocumentaryFilm",
    "#Facts",
    "#Investigation",
    "#Discovery",
    "#BehindTheScenes",
  ];

  const fallbacks = isArabic ? fallbackArabicTags : fallbackEnglishTags;

  if (niche) {
    const cleanNicheTag = `#${niche.replace(/^[#\s]+/, "").replace(/[\s\-]+/g, "_")}`;
    if (cleanNicheTag.length > 1 && !uniqueList.some((t) => t.toLowerCase() === cleanNicheTag.toLowerCase())) {
      uniqueList.unshift(cleanNicheTag);
    }
  }

  for (const tag of fallbacks) {
    if (uniqueList.length >= 15) break;
    const cleanTag = tag.startsWith("#") ? tag : `#${tag}`;
    if (!uniqueList.some((t) => t.toLowerCase() === cleanTag.toLowerCase())) {
      uniqueList.push(cleanTag);
    }
  }

  return uniqueList.slice(0, 15).map((t) => (t.startsWith("#") ? t : `#${t}`));
}


export function sanitizeSeoPackage(pkg: any, niche: string = "", title: string = "", language: string = ""): any {
  if (!pkg || typeof pkg !== "object") return pkg;
  if (Array.isArray(pkg.thumbnails)) {
    pkg.thumbnails = pkg.thumbnails.map((th: any) => ({
      ...th,
      visualPrompt: ensureOverlayTextInPrompt(th?.visualPrompt, th?.suggestedText),
    }));
  }
  pkg.hashtags = sanitizeHashtags(pkg.hashtags, niche, title, language);
  return pkg;
}

// 9. Generate Complete YouTube SEO Package & 3 Channel-Styled Thumbnail Prompts
app.post("/api/ai/seo-package", async (req, res) => {
  try {
    const {
      projectName,
      concept,
      niche,
      script,
      scenes,
      actualDurationSec,
      language,
      channelProfile,
      provider: requestedProvider,
    } = req.body || {};

    const provider = resolveEffectiveProvider(requestedProvider, req.body);

    const fmtClock = (sec: number) => {
      const m = Math.floor((sec || 0) / 60);
      const s = Math.floor((sec || 0) % 60);
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const corePromptRules = channelProfile?.promptRules || channelProfile?.visualStyleRules || "";
    const thumbnailStyleRules = channelProfile?.thumbnailStyleRules || "";
    const artStyleRules = channelProfile?.visualStyleRules || channelProfile?.promptRules || "Cinematic visual storytelling";
    const avatarRules = channelProfile?.avatarCharacterDesc || "";

    const channelThumbContext = channelProfile
      ? `\n================================================================================
🚨 SUPREME PRIORITY DIRECTIVE: REPLICATE CHANNEL VISUAL & THUMBNAIL STYLE 🚨
================================================================================
SELECTED CHANNEL PROFILE FOR YOUTUBE SEO & THUMBNAILS:
- Channel Name: ${channelProfile.name || "Active Channel"}
- Channel Niche: ${channelProfile.niche || "Documentary"}
- Channel Aspect Ratio: 16:9

[1. CHANNEL CORE PROMPT RULES & ART STYLE (MANDATORY)]:
"""
${corePromptRules || artStyleRules}
"""

[2. CHANNEL THUMBNAIL COMPOSITION & STYLE RULES (MANDATORY)]:
"""
${thumbnailStyleRules || "High-contrast focal subject, strong curiosity gap, expressive lighting, bold 2-4 word hook text"}
"""

${avatarRules ? `[3. CHANNEL AVATAR / CHARACTER VISUAL CONTINUITY]:\n"""\n${avatarRules}\n"""\n` : ""}
`
      : "";

    const prompt = `You are an elite YouTube SEO strategist and viral thumbnail art director.
Generate a complete, YouTube-policy-compliant SEO Metadata Package and 3 high-CTR Thumbnail Prompts for this video project.

Project Name: ${projectName || ""}
Selected Concept Title: ${concept?.title || projectName || ""}
Niche: ${channelProfile?.niche || concept?.niche || niche || "Documentary"}
Language: ${language || "English (US)"}
Actual Video Duration: ${fmtClock(actualDurationSec || 0)} (${actualDurationSec || 0} seconds)${channelThumbContext}

================================================================================
Approved Script Excerpt:
"""
${String(script || "").slice(0, 6000)}
"""

Approved Scenes with Real Timings:
${(scenes || [])
  .map((s: any) => `${fmtClock(s.startTime)} - Scene ${s.sceneNumber}: ${s.mainSubject || s.visualDescription} (${s.scriptExcerpt?.slice(0, 90)}...)`)
  .join("\n")}

================================================================================
YOUTUBE SEO & POLICY REQUIREMENTS:
1. Titles: Exactly 5 natural, high-CTR title options that spark intense curiosity while remaining 100% compliant with YouTube community & advertiser-friendly policies (no deceptive clickbait or policy-violating terms).
2. Description: Complete, SEO-optimized YouTube description with an engaging 2-line opening hook above the fold, full narrative summary with natural keywords, chapter timestamps, and safe community call-to-action.
3. Chapters: Ordered timestamps starting at 00:00 and strictly within ${fmtClock(actualDurationSec || 0)} based on the actual scenes.
4. Tags: High-ranking YouTube search tags whose comma-separated total length is strictly under 460 characters (well below YouTube's 500-char limit).
5. Hashtags: EXACTLY 15 viral YouTube hashtags. MANDATORY REQUIREMENT: Every single hashtag MUST start with the '#' symbol (e.g. '#Mystery', '#History', '#Documentary', etc.). You MUST return an array of exactly 15 hashtags, each with the '#' prefix.
6. Thumbnails: Exactly 3 distinct, high-converting thumbnail concepts tailored to the selected channel's visual & thumbnail style rules. Each thumbnail must include:
   - conceptTitle: Name of the thumbnail angle (e.g., "The Mystery Reveal", "Extreme Scale Contrast", "Character Reaction")
   - suggestedText: Punchy 2–4 word text overlay in bold hook style (e.g. "THE LOST TRUTH", "WHY IT HAPPENED", "FORBIDDEN REVEAL").
   - visualPrompt: A 100% COMPLETE, standalone, ready-to-run AI image generation prompt for Midjourney v6, Flux, Ideogram 2.0, or DALL-E 3, repeating the channel's visual style, art medium, avatar/character traits, lighting, color palette, and aspect ratio (--ar 16:9).
     🚨 MANDATORY TEXT-IN-PROMPT DIRECTIVE: You MUST integrate and embed the "suggestedText" directly INSIDE the "visualPrompt" itself!
     The user will copy this exact prompt to an AI image generator (Ideogram / Flux / Midjourney v6) to generate the complete thumbnail with the text.
     Therefore, you MUST explicitly write out the typography directive within the prompt:
     e.g., '... featuring bold, high-contrast typography text overlay reading "[INSERT SUGGESTED TEXT HERE]" in large impactful YouTube thumbnail font with subtle drop shadow, cinematic composition ... --ar 16:9'
     Never leave the visualPrompt without the suggestedText embedded inside it in quotation marks!
     CRITICAL: If reference images are attached, you MUST replicate their exact art style (e.g. 2D dark anime, 3D hyperreal, moody oil painting, vintage noir, retro comic) and NOT use generic photo styles!
   - compositionNotes: Why this composition and typography layout drive clicks.
7. Publishing Metadata: Recommended YouTube category, language, madeForKids (boolean), and standard YouTube license.`;

    const firstThumbRef =
      channelProfile?.thumbnailReferenceImages?.[0] ||
      channelProfile?.styleReferenceImages?.[0] ||
      channelProfile?.avatarImages?.[0] ||
      null;

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const rawJson = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt: `${prompt}\n\nReturn strictly valid JSON with keys: titles (array of 5 strings), description (string), chapters (array of {timestamp, title, isEstimate}), tags (array of strings), hashtags (array of exactly 15 strings starting with #), thumbnails (array of 3 objects with {id, conceptTitle, suggestedText, visualPrompt, compositionNotes}), and metadata ({category, language, madeForKids, license}).`,
        imageBase64: firstThumbRef?.dataUrl || null,
        imageMime: firstThumbRef?.mimeType || "image/jpeg",
        jsonMode: true,
      });
      const parsed = sanitizeSeoPackage(parseJsonClean(rawJson), channelProfile?.niche || niche, projectName, language);
      return res.json(parsed);
    }

    const imageParts: any[] = [];
    for (const img of (channelProfile?.thumbnailReferenceImages || []).slice(0, 3)) {
      if (img?.dataUrl) {
        const cleanB64 = String(img.dataUrl).replace(/^data:[^;]+;base64,/, "");
        imageParts.push({
          inlineData: { data: cleanB64, mimeType: img.mimeType || "image/jpeg" },
        });
      }
    }
    for (const img of (channelProfile?.styleReferenceImages || []).slice(0, 3)) {
      if (img?.dataUrl) {
        const cleanB64 = String(img.dataUrl).replace(/^data:[^;]+;base64,/, "");
        imageParts.push({
          inlineData: { data: cleanB64, mimeType: img.mimeType || "image/jpeg" },
        });
      }
    }
    for (const img of (channelProfile?.avatarImages || []).slice(0, 1)) {
      if (img?.dataUrl) {
        const cleanB64 = String(img.dataUrl).replace(/^data:[^;]+;base64,/, "");
        imageParts.push({
          inlineData: { data: cleanB64, mimeType: img.mimeType || "image/jpeg" },
        });
      }
    }

    const parts: any[] = [];
    if (imageParts.length > 0) {
      parts.push({
        text: `=== ATTACHED CHANNEL VISUAL REFERENCE & THUMBNAIL IMAGES (${imageParts.length} IMAGE(S)) ===
These attached reference images define the official thumbnail aesthetic and visual art style of channel "${channelProfile?.name || "Active Channel"}".
Observe their art medium, linework, color grading, contrast, lighting mood, and rendering texture.
You MUST replicate and incorporate these exact visual characteristics into all 3 thumbnail visualPrompts below:`,
      });
      parts.push(...imageParts);
    }
    parts.push({ text: prompt });

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: [{ role: "user", parts }],
          config: buildGeminiTextConfig(modelToUse, {
            responseMimeType: "application/json",
            responseSchema: {
            type: Type.OBJECT,
            properties: {
              titles: { type: Type.ARRAY, items: { type: Type.STRING } },
              description: { type: Type.STRING },
              chapters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timestamp: { type: Type.STRING },
                    title: { type: Type.STRING },
                    isEstimate: { type: Type.BOOLEAN },
                  },
                  required: ["timestamp", "title", "isEstimate"],
                },
              },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              thumbnails: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    conceptTitle: { type: Type.STRING },
                    suggestedText: { type: Type.STRING },
                    visualPrompt: { type: Type.STRING },
                    compositionNotes: { type: Type.STRING },
                  },
                  required: ["id", "conceptTitle", "suggestedText", "visualPrompt", "compositionNotes"],
                },
              },
              metadata: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  language: { type: Type.STRING },
                  madeForKids: { type: Type.BOOLEAN },
                  license: { type: Type.STRING },
                },
                required: ["category", "language", "madeForKids", "license"],
              },
            },
            required: ["titles", "description", "chapters", "tags", "hashtags", "thumbnails", "metadata"],
          },
        }),
      }),
      req.body
    );

    const parsed = sanitizeSeoPackage(parseJsonClean(response.text || "{}"), channelProfile?.niche || niche, projectName, language);
    if (parsed && typeof parsed === "object") {
      parsed._usedModel = (response as any)._usedModel;
      parsed._initialModel = (response as any)._initialModel;
      parsed._modelSwitched = (response as any)._modelSwitched;
    }
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate YouTube SEO package." });
  }
});

// 9.1 Regenerate Titles Only
app.post("/api/ai/seo-regenerate-titles", async (req, res) => {
  try {
    const { projectName, concept, niche, script, language, channelProfile, customDirection, provider: requestedProvider } = req.body || {};
    const provider = resolveEffectiveProvider(requestedProvider, req.body);
    const prompt = `You are an elite YouTube title strategist. Generate exactly 5 new, distinct, high-CTR, policy-compliant title options for this video.
Project: ${projectName || ""}
Concept: ${concept?.title || ""}
Niche: ${channelProfile?.niche || niche || "Documentary"}
Language: ${language || "English (US)"}
${customDirection ? `Custom Direction: ${customDirection}\n` : ""}
Script Excerpt: """${String(script || "").slice(0, 3000)}"""

Return strictly valid JSON with key: "titles" (array of 5 strings).`;

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const rawJson = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt: `${prompt}\n\nReturn strictly valid JSON with key: "titles" (array of 5 strings).`,
        jsonMode: true,
      });
      const parsed = parseJsonClean(rawJson);
      return res.json({ titles: Array.isArray(parsed?.titles) ? parsed.titles.slice(0, 5) : [] });
    }

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: buildGeminiTextConfig(modelToUse, {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                titles: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["titles"],
            },
          }),
        }),
      req.body
    );
    const parsed = parseJsonClean(response.text || "{}");
    res.json({
      titles: Array.isArray(parsed?.titles) ? parsed.titles.slice(0, 5) : [],
      _usedModel: (response as any)._usedModel,
      _initialModel: (response as any)._initialModel,
      _modelSwitched: (response as any)._modelSwitched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to regenerate titles." });
  }
});

// 9.2 Regenerate Description & Chapters Only
app.post("/api/ai/seo-regenerate-description", async (req, res) => {
  try {
    const { projectName, concept, niche, script, scenes, actualDurationSec, language, customDirection, provider: requestedProvider } = req.body || {};
    const provider = resolveEffectiveProvider(requestedProvider, req.body);

    const fmtClock = (sec: number) => {
      const m = Math.floor((sec || 0) / 60);
      const s = Math.floor((sec || 0) % 60);
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const prompt = `You are an elite YouTube copywriter. Generate a fresh, complete, SEO-rich YouTube description for this video.
Must include:
1. 2-line curiosity hook above the fold.
2. Full engaging narrative summary packed with natural keywords.
3. Accurate chapter breakdown timestamps strictly within ${fmtClock(actualDurationSec || 0)} based on scenes.
4. Safe community call to action.

Project: ${projectName || ""}
Concept: ${concept?.title || ""}
Niche: ${niche || "Documentary"}
Language: ${language || "English (US)"}
${customDirection ? `Custom Focus: ${customDirection}\n` : ""}
Script Excerpt: """${String(script || "").slice(0, 4000)}"""
Scenes: ${(scenes || []).map((s: any) => `${fmtClock(s.startTime)} - Scene ${s.sceneNumber}: ${s.mainSubject || s.visualDescription}`).join("\n")}

Return strictly valid JSON with keys: "description" (string) and "chapters" (array of {timestamp, title, isEstimate}).`;

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const rawJson = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt: `${prompt}\n\nReturn strictly valid JSON with keys: "description" (string) and "chapters" (array of {timestamp, title, isEstimate}).`,
        jsonMode: true,
      });
      const parsed = parseJsonClean(rawJson);
      return res.json({ description: parsed?.description || "", chapters: parsed?.chapters || [] });
    }

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: buildGeminiTextConfig(modelToUse, {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                chapters: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      timestamp: { type: Type.STRING },
                      title: { type: Type.STRING },
                      isEstimate: { type: Type.BOOLEAN },
                    },
                    required: ["timestamp", "title", "isEstimate"],
                  },
                },
              },
              required: ["description", "chapters"],
            },
          }),
        }),
      req.body
    );
    const parsed = parseJsonClean(response.text || "{}");
    res.json({
      description: parsed?.description || "",
      chapters: parsed?.chapters || [],
      _usedModel: (response as any)._usedModel,
      _initialModel: (response as any)._initialModel,
      _modelSwitched: (response as any)._modelSwitched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to regenerate description." });
  }
});

// 9.3 Regenerate Exactly 15 Hashtags (all starting with #) & Tags
app.post("/api/ai/seo-regenerate-hashtags", async (req, res) => {
  try {
    const { projectName, concept, niche, script, language, customDirection, provider: requestedProvider } = req.body || {};
    const provider = resolveEffectiveProvider(requestedProvider, req.body);

    const prompt = `You are a YouTube algorithm specialist. Generate high-volume tags and EXACTLY 15 viral hashtags for this video.
MANDATORY RULES:
1. Hashtags: EXACTLY 15 viral hashtags matching the video's language (${language || "same as video"}).
   EVERY SINGLE WORD/HASHTAG MUST START WITH '#'. (e.g. '#Word1', '#Word2', ... or in Arabic '#غموض', '#وثائقي', '#قصص_واقعية', etc.).
   Every generated word MUST have '#' directly attached. No plain words without '#'.
2. Tags: Search tags whose comma-separated total length is strictly under 460 characters.

Project: ${projectName || ""}
Concept: ${concept?.title || ""}
Niche: ${niche || "Documentary"}
Language: ${language || "English (US)"}
${customDirection ? `Custom Focus: ${customDirection}\n` : ""}
Script Excerpt: """${String(script || "").slice(0, 3000)}"""

Return strictly valid JSON with keys: "hashtags" (array of exactly 15 strings starting with #) and "tags" (array of strings).`;

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const rawJson = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt: `${prompt}\n\nReturn strictly valid JSON with keys: "hashtags" (array of 15 strings starting with #) and "tags" (array of strings).`,
        jsonMode: true,
      });
      const parsed = parseJsonClean(rawJson);
      const hashtags = sanitizeHashtags(parsed?.hashtags, niche, projectName, language);
      return res.json({ hashtags, tags: Array.isArray(parsed?.tags) ? parsed.tags : [] });
    }

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: buildGeminiTextConfig(modelToUse, {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["hashtags", "tags"],
            },
          }),
        }),
      req.body
    );
    const parsed = parseJsonClean(response.text || "{}");
    const hashtags = sanitizeHashtags(parsed?.hashtags, niche, projectName, language);
    res.json({ hashtags, tags: Array.isArray(parsed?.tags) ? parsed.tags : [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to regenerate hashtags." });
  }
});

// 9.4 Regenerate 3 Channel-Styled Thumbnail Prompts with Embedded Overlay Text
app.post("/api/ai/seo-regenerate-thumbnails", async (req, res) => {
  try {
    const { projectName, concept, niche, script, channelProfile, customDirection, provider: requestedProvider } = req.body || {};
    const provider = resolveEffectiveProvider(requestedProvider, req.body);

    const corePromptRules = channelProfile?.promptRules || channelProfile?.visualStyleRules || "";
    const thumbnailStyleRules = channelProfile?.thumbnailStyleRules || "";
    const artStyleRules = channelProfile?.visualStyleRules || channelProfile?.promptRules || "Cinematic visual storytelling";

    const prompt = `You are a viral YouTube thumbnail art director.
Generate exactly 3 high-CTR, distinct thumbnail concepts matching channel "${channelProfile?.name || "Active Channel"}" branding.

Requirements:
- conceptTitle: Angle of the thumbnail
- suggestedText: Punchy 2-4 word text overlay
- visualPrompt: COMPLETE standalone image prompt for Midjourney v6 / Flux / Ideogram (--ar 16:9).
  🚨 MANDATORY: You MUST integrate the suggested text directly inside visualPrompt!
  e.g.: '... featuring bold, high-contrast typography text overlay reading "[SUGGESTED_TEXT]" in large impactful YouTube thumbnail font with drop shadow ... --ar 16:9'
- compositionNotes: Why this drives clicks.

Project: ${projectName || ""}
Concept: ${concept?.title || ""}
Niche: ${channelProfile?.niche || niche || "Documentary"}
${customDirection ? `Custom Direction: ${customDirection}\n` : ""}
Channel Style Rules: """${corePromptRules || artStyleRules}"""
Thumbnail Rules: """${thumbnailStyleRules}"""
Script Excerpt: """${String(script || "").slice(0, 3000)}"""

Return strictly valid JSON with key: "thumbnails" (array of 3 objects with {id, conceptTitle, suggestedText, visualPrompt, compositionNotes}).`;

    const firstThumbRef = channelProfile?.thumbnailReferenceImages?.[0] || channelProfile?.styleReferenceImages?.[0] || null;

    if (provider === "external" || provider === "codecraft") {
      const cc = getCodeCraftCreds(req.body);
      const rawJson = await callCodeCraftChat({
        apiKey: cc.apiKey,
        baseUrl: cc.baseUrl,
        model: cc.textModel,
        prompt: `${prompt}\n\nReturn strictly valid JSON with key "thumbnails" (array of 3 objects).`,
        imageBase64: firstThumbRef?.dataUrl || null,
        imageMime: firstThumbRef?.mimeType || "image/jpeg",
        jsonMode: true,
      });
      const parsed = parseJsonClean(rawJson);
      const sanitized = (parsed?.thumbnails || []).map((th: any) => ({
        ...th,
        visualPrompt: ensureOverlayTextInPrompt(th?.visualPrompt, th?.suggestedText),
      }));
      return res.json({ thumbnails: sanitized });
    }

    const response = await executeGeminiWithFailover(
      (ai, _kIdx, _tot, modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: buildGeminiTextConfig(modelToUse, {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                thumbnails: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      conceptTitle: { type: Type.STRING },
                      suggestedText: { type: Type.STRING },
                      visualPrompt: { type: Type.STRING },
                      compositionNotes: { type: Type.STRING },
                    },
                    required: ["id", "conceptTitle", "suggestedText", "visualPrompt", "compositionNotes"],
                  },
                },
              },
              required: ["thumbnails"],
            },
          }),
        }),
      req.body
    );
    const parsed = parseJsonClean(response.text || "{}");
    const sanitized = (parsed?.thumbnails || []).map((th: any) => ({
      ...th,
      visualPrompt: ensureOverlayTextInPrompt(th?.visualPrompt, th?.suggestedText),
    }));
    res.json({ thumbnails: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to regenerate thumbnail prompts." });
  }
});

// Error handling middleware for oversized payloads
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    return res.status(413).json({
      error: "Payload too large (413). The request content exceeds the allowed size limit. Heavy media is automatically stripped from narration script requests.",
    });
  }
  next(err);
});

// Explicit JSON 404 handler for any unknown /api/* route so it never falls through to HTML
app.all("/api/*", (req, res) => {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
  });
});

export default app;
