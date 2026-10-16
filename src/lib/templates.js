// Templates & Style Presets Manager
// Allows users to save their current custom styles/captions/effects and load them across projects.

export const BUILTIN_TEMPLATES = [
  {
    id: "viral_yellow",
    name: "🔥 Viral Shorts (كاريوكي أصفر)",
    desc: "Anton bold font, electric yellow, word-by-word karaoke highlight",
    captionStyle: "classic",
    captionColor: "#FFE600",
    captionAnimation: "karaoke",
    captionFont: "anton",
    captionSize: "lg",
    captionPosition: 20,
    captionLineHeight: 1.2,
    captionFontScale: 0.065,
    effectId: "vivid",
    effectIntensity: 0.7,
  },
  {
    id: "typewriter_cyan",
    name: "⌨️ Typewriter Cyan (كتابة تدريجية)",
    desc: "Smooth typewriter typing motion, electric cyan color, clean shadow",
    captionStyle: "shadow",
    captionColor: "#00F0FF",
    captionAnimation: "typewriter",
    captionFont: "montserrat",
    captionSize: "md",
    captionPosition: 22,
    captionLineHeight: 1.25,
    captionFontScale: 0.055,
    effectId: "cool",
    effectIntensity: 0.5,
  },
  {
    id: "word_reveal_lime",
    name: "💬 Hormozi Word Reveal (كلمة بكلمة)",
    desc: "Kinetic word-by-word reveal pop, neon lime green, high contrast",
    captionStyle: "bold",
    captionColor: "#00FF88",
    captionAnimation: "word_by_word",
    captionFont: "anton",
    captionSize: "lg",
    captionPosition: 25,
    captionLineHeight: 1.2,
    captionFontScale: 0.062,
    effectId: "vivid",
    effectIntensity: 0.65,
  },
  {
    id: "cinema_minimal",
    name: "🎬 Cinema Minimal (سينما أبيض)",
    desc: "Montserrat clean, crisp white, smooth slide up, warm cinema grade",
    captionStyle: "cinema",
    captionColor: "#FFFFFF",
    captionAnimation: "slide",
    captionFont: "montserrat",
    captionSize: "md",
    captionPosition: 15,
    captionLineHeight: 1.25,
    captionFontScale: 0.05,
    effectId: "warm",
    effectIntensity: 0.5,
  },
  {
    id: "boxed_pink",
    name: "🌸 TikTok Pop Box (صندوق وردي)",
    desc: "Boxed background, vibrant neon pink, elastic bounce pop",
    captionStyle: "boxed",
    captionColor: "#FF2A85",
    captionAnimation: "pop",
    captionFont: "poppins",
    captionSize: "lg",
    captionPosition: 30,
    captionLineHeight: 1.5,
    captionFontScale: 0.06,
    effectId: "vignette",
    effectIntensity: 0.65,
  },
  {
    id: "golden_pulse",
    name: "✨ Golden Aura (توهج ذهبي)",
    desc: "Sunset orange/gold, rhythmic neon pulse glow, film grain",
    captionStyle: "bold",
    captionColor: "#FF7A00",
    captionAnimation: "glow",
    captionFont: "anton",
    captionSize: "lg",
    captionPosition: 20,
    captionLineHeight: 1.2,
    captionFontScale: 0.062,
    effectId: "grain",
    effectIntensity: 0.45,
  },
  {
    id: "cyberpunk_neon",
    name: "⚡ Cyberpunk Neon (سايبر بنك)",
    desc: "Neon magenta/pink, typewriter typing, cyber glow filter",
    captionStyle: "shadow",
    captionColor: "#FF2A85",
    captionAnimation: "typewriter",
    captionFont: "poppins",
    captionSize: "md",
    captionPosition: 22,
    captionLineHeight: 1.3,
    captionFontScale: 0.058,
    effectId: "cyberpunk",
    effectIntensity: 0.7,
  },
];

const STORAGE_KEY = "autoeditor_saved_templates_v1";

export function getSavedTemplates() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function saveUserTemplate(template) {
  if (typeof window === "undefined") return [];
  try {
    const existing = getSavedTemplates();
    const newEntry = {
      ...template,
      id: "tmpl_" + Date.now(),
      createdAt: Date.now(),
    };
    const updated = [newEntry, ...existing];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (_) {
    return [];
  }
}

export function deleteUserTemplate(id) {
  if (typeof window === "undefined") return [];
  try {
    const existing = getSavedTemplates();
    const updated = existing.filter((t) => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (_) {
    return [];
  }
}

export function exportTemplatesJson() {
  const templates = getSavedTemplates();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(templates, null, 2));
  const dl = document.createElement("a");
  dl.setAttribute("href", dataStr);
  dl.setAttribute("download", `autoeditor-templates-${new Date().toISOString().slice(0, 10)}.json`);
  dl.click();
}

export function importTemplatesJson(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;
    const existing = getSavedTemplates();
    const merged = [...parsed, ...existing.filter((e) => !parsed.some((p) => p.name === e.name))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (_) {
    return null;
  }
}
