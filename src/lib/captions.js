// Captions: parse an uploaded timestamped transcript into short caption cues,
// draw them on the preview canvas, and build the ffmpeg drawtext chain that
// burns them into the render. Preview and render share the same font + styles
// so what you see is what you get.

// ---- style presets (shared by preview canvas + ffmpeg drawtext) ----
// `fill`/`stroke`/`box` drive the canvas preview; `dt(bw)` returns the
// drawtext colour/box options for the burn-in.
// A style drives the preview canvas (fill/stroke/box/bar/shadow/strokeW) AND the
// ffmpeg burn-in (dt()). The web path only uses the canvas fields; dt() exists so
// the disabled ffmpeg path never throws.
export const CAPTION_STYLES = {
  // --- Trending YouTube Automation Presets ---
  hormozi: {
    id: "hormozi", label: "Hormozi Viral", labelAr: "هورموزي فايرال",
    fill: "#FFE600", stroke: "#000000", strokeW: 2.5, box: null,
    shadow: { color: "rgba(0,0,0,0.95)", blur: 0.15 },
    isViral: true, badge: "🔥 TREND",
    desc: "Ultra-bold yellow punch, heavy 3D black stroke, maximum retention",
    dt: (bw) => `fontcolor=0xFFE600:borderw=${Math.round(bw * 2.5)}:bordercolor=black`,
  },
  beast: {
    id: "beast", label: "MrBeast Pop", labelAr: "مستر بيست بوب",
    fill: "#00F0FF", stroke: "#000000", strokeW: 2.3, box: null,
    tilt: -2.4, // energetic comic angle
    shadow: { color: "#000000", blur: 0, offX: 3, offY: 3 },
    isViral: true, badge: "🔥 TREND",
    desc: "Comic pop angle with thick stroke and bold comic drop shadow",
    dt: (bw) => `fontcolor=0x00F0FF:borderw=${Math.round(bw * 2.3)}:bordercolor=black`,
  },
  vox: {
    id: "vox", label: "Vox Explainer", labelAr: "فوكس الوثائقي",
    fill: "#FFFFFF", stroke: null, box: "rgba(10, 12, 16, 0.78)",
    accentUnderline: "#F59E0B", // warm golden marker line
    isViral: true, badge: "🎬 DOC",
    desc: "Journalistic lower-third bar with warm golden marker underline",
    dt: (bw, fs) => `fontcolor=white:box=1:boxcolor=0x0A0C10@0.8:boxborderw=${Math.max(4, Math.round(fs * 0.18))}`,
  },
  magnates: {
    id: "magnates", label: "Magnates Luxury", labelAr: "ماغنيتس الفاخر",
    fill: "#F6E09C", stroke: null, box: null,
    shadow: { color: "rgba(212,175,55,0.45)", blur: 0.28 },
    isViral: true, badge: "👑 LUXURY",
    desc: "Cinematic burnished gold with soft luxury glow for video essays",
    dt: () => `fontcolor=0xF6E09C:shadowcolor=0xD4AF37@0.5:shadowx=2:shadowy=2`,
  },
  gadzhi: {
    id: "gadzhi", label: "Iman Minimal", labelAr: "إيمان قادجي مينيمال",
    fill: "#F8FAFC", stroke: null, box: "rgba(18, 20, 26, 0.65)",
    pill: true, letterSpacing: 2,
    isViral: true, badge: "💎 MINIMAL",
    desc: "Wide tracking, frosted glass pill badge, sleek luxury modern",
    dt: (bw, fs) => `fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=${Math.max(4, Math.round(fs * 0.18))}`,
  },
  cyber: {
    id: "cyber", label: "Cyber Neon", labelAr: "سايبر نيون",
    fill: "#00F0FF", stroke: "#08101C", strokeW: 1.8, box: null,
    neonAura: "#FF007F",
    isViral: true, badge: "⚡ NEON",
    desc: "Vibrant synthwave cyan with pulsing magenta backlight",
    dt: (bw) => `fontcolor=0x00F0FF:borderw=${bw}:bordercolor=0x08101C`,
  },

  // --- Classic & Built-in Styles ---
  classic: {
    id: "classic", label: "Classic", labelAr: "كلاسيكي",
    fill: "#ffffff", stroke: "#000000", box: null,
    dt: (bw) => `fontcolor=white:borderw=${bw}:bordercolor=black@0.9`,
  },
  boxed: {
    id: "boxed", label: "Boxed", labelAr: "صندوق أسود",
    fill: "#ffffff", stroke: null, box: "rgba(0,0,0,0.6)",
    dt: (bw, fs) => `fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=${Math.max(3, Math.round(fs * 0.16))}`,
  },
  yellow: {
    id: "yellow", label: "Yellow", labelAr: "أصفر قياسي",
    fill: "#ffd400", stroke: "#000000", box: null,
    dt: (bw) => `fontcolor=0xFFD400:borderw=${bw}:bordercolor=black@0.9`,
  },
  bar: {
    id: "bar", label: "Bar", labelAr: "شريط عريض",
    fill: "#ffffff", stroke: null, box: null, bar: "rgba(0,0,0,0.55)",
    dt: (bw, fs) => `fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=${Math.max(3, Math.round(fs * 0.16))}`,
  },
  shadow: {
    id: "shadow", label: "Shadow", labelAr: "ظل ناعم",
    fill: "#ffffff", stroke: null, box: null, shadow: { color: "rgba(0,0,0,0.85)", blur: 0.18 },
    dt: () => `fontcolor=white:shadowcolor=black@0.85:shadowx=2:shadowy=2`,
  },
  bold: {
    id: "bold", label: "Bold", labelAr: "عريض قوي",
    fill: "#ffffff", stroke: "#000000", box: null, strokeW: 1.7,
    dt: (bw) => `fontcolor=white:borderw=${Math.round(bw * 1.7)}:bordercolor=black`,
  },
  mint: {
    id: "mint", label: "Mint", labelAr: "مينت باستيل",
    fill: "#a0c2b4", stroke: "#0e1512", box: null,
    dt: (bw) => `fontcolor=0xA0C2B4:borderw=${bw}:bordercolor=black@0.9`,
  },
  cinema: {
    id: "cinema", label: "Cinema", labelAr: "سينما دافئ",
    fill: "#efe7d0", stroke: null, box: null, shadow: { color: "rgba(0,0,0,0.7)", blur: 0.14 },
    dt: () => `fontcolor=0xEFE7D0:shadowcolor=black@0.7:shadowx=2:shadowy=2`,
  },
};
export const CAPTION_STYLE_LIST = Object.keys(CAPTION_STYLES).map((id) => CAPTION_STYLES[id]);

// Bundled fonts (preview canvas + WebCodecs export share these via @font-face).
export const CAPTION_FONTS = [
  { id: "montserrat", label: "Montserrat ExtraBold (MrBeast/Viral)", family: "Montserrat" },
  { id: "anton", label: "Anton (Impact/Shorts)", family: "Anton" },
  { id: "poppins", label: "Poppins (Modern Sans)", family: "Poppins" },
  { id: "default", label: "System Default", family: "CaptionFont" },
];
export function captionFontFamily(id) {
  const f = CAPTION_FONTS.find((x) => x.id === id);
  return f ? f.family : "CaptionFont";
}

export const CAPTION_POSITIONS = ["top", "middle", "bottom"];

export const CAPTION_SIZES = { sm: 0.042, md: 0.052, lg: 0.064 };
export const CAPTION_FONT = "caption.ttf";          // path in the ffmpeg FS
export const captionCueFile = (i) => `cap${i}.txt`;  // per-cue textfile in the FS

export function captionFontPx(height, sizeId, customScale) {
  const frac = customScale > 0 ? customScale : (CAPTION_SIZES[sizeId] || CAPTION_SIZES.md);
  return Math.round(height * frac);
}

const MAX_LINE = 42;       // chars before wrapping to a second line
const MAX_CUE_CHARS = 84;  // chars before starting a new caption cue
const MARGIN_FACTOR = 0.07;

// ---- timestamp helpers ----
function hms(str) {
  const m = String(str).match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/);
  if (!m) return null;
  const h = +(m[1] || 0), mi = +m[2], se = +m[3];
  const ms = m[4] ? +m[4].padEnd(3, "0") : 0;
  return h * 3600 + mi * 60 + se + ms / 1000;
}

// SRT / VTT — cues carry explicit start AND end.
function parseArrow(text) {
  const out = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trim())
      .filter((l) => l && l !== "WEBVTT" && !/^\d+$/.test(l));
    const tl = lines.find((l) => l.includes("-->"));
    if (!tl) continue;
    const ts = tl.match(/(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?/g);
    if (!ts || ts.length < 2) continue;
    const txt = lines.filter((l) => l !== tl).join(" ").trim();
    if (txt) out.push({ start: hms(ts[0]), end: hms(ts[1]), text: txt });
  }
  return out;
}

// NoteGPT-style range blocks: "HH:MM:SS - HH:MM:SS" then a paragraph.
function parseRanges(text) {
  const re = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—]\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*$/;
  const out = [];
  let cur = null;
  for (const ln of text.split("\n")) {
    const m = ln.match(re);
    if (m) {
      if (cur && cur.text.trim()) out.push(cur);
      cur = { start: hms(m[1]), end: hms(m[2]), text: "" };
    } else if (cur) {
      const t = ln.trim();
      if (t) cur.text += (cur.text ? " " : "") + t;
    }
  }
  if (cur && cur.text.trim()) out.push(cur);
  return out;
}

// Inline markers anywhere in the text: "(0:03) text ... (0:20) more".
// Each marker owns the text up to the next marker, across line breaks.
function parseMarkers(text) {
  const re = /[([]\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*[)\]]/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ start: hms(m[1]), from: re.lastIndex, at: m.index });
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const to = i + 1 < marks.length ? marks[i + 1].at : text.length;
    const txt = text.slice(marks[i].from, to).replace(/\s+/g, " ").trim();
    if (txt) out.push({ start: marks[i].start, end: null, text: txt });
  }
  return out;
}

// Inline: "[0:03] text" or "0:03 text" per line.
function parseInline(text) {
  const re = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s+(.*\S)\s*$/;
  const out = [];
  for (const ln of text.split("\n")) {
    const m = ln.match(re);
    if (m) out.push({ start: hms(m[1]), end: null, text: m[2].trim() });
  }
  return out;
}

// Wrap a caption string onto (at most) two balanced lines.
function wrap(str) {
  if (str.length <= MAX_LINE) return str;
  const words = str.split(" ");
  const half = str.length / 2;
  let a = "", b = "";
  for (const w of words) {
    if (!b && a.length + w.length <= half) a = a ? `${a} ${w}` : w;
    else b = b ? `${b} ${w}` : w;
  }
  return b ? `${a}\n${b}` : a;
}

// Reflow a caption into balanced lines that each fit the frame WIDTH at the given
// font size. Unlike the fixed-char wrap() used at parse time, this is width-aware,
// so 9:16 (portrait) captions don't overflow the sides. It's resolution-
// independent: W and fontPx scale together, so preview (full res) and render
// (e.g. 720p) wrap the same way = WYSIWYG.
export function captionMaxChars(W, fontPx) {
  return Math.max(8, Math.floor((W * 0.90) / (fontPx * 0.58)));
}
export function wrapToWidth(text, maxChars) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  // Greedy fill: every line is guaranteed to stay within maxChars (except a lone
  // word longer than a line), so nothing ever overflows the frame width.
  const words = clean.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cur && cand.length > maxChars) { lines.push(cur); cur = w; }
    else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Split one timed segment into caption cues, timed proportionally to length.
function chunkSegment(seg, cues) {
  const words = seg.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return;
  const chunks = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length > MAX_CUE_CHARS && cur) { chunks.push(cur); cur = w; }
    else cur = cand;
    if (/[.!?]["')]?$/.test(w) && cur.length >= MAX_CUE_CHARS * 0.5) { chunks.push(cur); cur = ""; }
  }
  if (cur) chunks.push(cur);

  const totalChars = chunks.reduce((a, c) => a + c.length, 0) || 1;
  const span = Math.max(0.2, seg.end - seg.start);
  let t = seg.start;
  for (const c of chunks) {
    const d = span * (c.length / totalChars);
    const end = c === chunks[chunks.length - 1] ? seg.end : t + d;
    cues.push({ start: t, end, text: wrap(c) });
    t = end;
  }
}

// Parse raw transcript text into caption cues. `duration` (audio length) is used
// only to close the final segment. Returns { cues, error }.
export function parseTranscript(raw, duration = 0) {
  if (!raw || !raw.trim()) return { cues: [], error: "The file is empty." };
  const text = raw.replace(/\r/g, "");

  let segs = text.includes("-->") ? parseArrow(text) : parseRanges(text);
  if (!segs.length) segs = parseMarkers(text);
  if (!segs.length) segs = parseInline(text);
  segs = segs.filter((s) => s.start != null && s.text);
  if (!segs.length) {
    return { cues: [], error: "No timestamps found — use an SRT/VTT or a timestamped transcript." };
  }

  segs.sort((a, b) => a.start - b.start);
  for (let i = 0; i < segs.length; i++) {
    const nextStart = i + 1 < segs.length
      ? segs[i + 1].start
      : (duration || segs[i].start + segs[i].text.split(/\s+/).length / 2.5);
    let end = segs[i].end != null ? Math.min(segs[i].end, nextStart) : nextStart;
    if (!(end > segs[i].start)) end = Math.max(nextStart, segs[i].start + 0.4);
    segs[i].end = end;
  }

  const cues = [];
  for (const s of segs) chunkSegment(s, cues);
  return { cues, error: cues.length ? null : "Could not build any caption lines." };
}

// Current caption text for time t (empty string if none).
export function captionAt(cues, t) {
  if (!cues) return "";
  for (let i = 0; i < cues.length; i++) {
    if (t >= cues[i].start && t < cues[i].end) return cues[i].text;
  }
  return "";
}

// Line-height factor (top-to-top). Boxed captions need extra spacing so the
// per-line background boxes keep a visible gap instead of touching/overlapping.
const lineHeightFactor = (st) => (st && st.box ? 1.5 : 1.16);
// The default line spacing for a style (what the UI slider starts at).
export function captionLineHeightDefault(styleId) {
  return lineHeightFactor(CAPTION_STYLES[styleId] || CAPTION_STYLES.classic);
}

// Caption vertical position as a percent: 100 = top, 50 = middle, 0 = bottom.
// Accepts a number, or legacy "top"/"middle"/"bottom" strings from old projects.
export function captionPosPct(position) {
  if (typeof position === "number") return Math.max(0, Math.min(100, position));
  if (position === "top") return 100;
  if (position === "middle") return 50;
  return 0; // "bottom" / default
}

// Vertical slot (top y) for line i of an n-line caption, anchored by `position`
// (percent: 100 = top, 50 = middle, 0 = bottom). Linear between the top and
// bottom margins, so 50 lands exactly centered. Bottom (0) = original behavior.
const lineTop = (H, fontPx, n, i, lhf = 1.16, position = 0) => {
  const blockH = n * fontPx * lhf;
  const pct = captionPosPct(position) / 100;
  const topMin = H * MARGIN_FACTOR;                 // fully at top
  const topMax = H - H * MARGIN_FACTOR - blockH;    // fully at bottom
  const top0 = topMax + pct * (topMin - topMax);
  return Math.round(top0 + i * fontPx * lhf);
};


export const CAPTION_PRESET_COLORS = [
  { id: "yellow", label: "Electric Yellow / أصفر فايرال", value: "#FFE600" },
  { id: "lime", label: "Neon Lime / أخضر نيون", value: "#00FF66" },
  { id: "cyan", label: "Cyan Punch / سماوي ناصع", value: "#00F0FF" },
  { id: "white", label: "Pure White / أبيض نقي", value: "#FFFFFF" },
  { id: "gold", label: "Royal Gold / ذهبي ملكي", value: "#F59E0B" },
  { id: "pink", label: "Hot Magenta / وردي فاقع", value: "#FF2A85" },
  { id: "orange", label: "Sunset Orange / برتقالي حارق", value: "#FF7A00" },
  { id: "purple", label: "Synth Purple / بنفسجي", value: "#B066FF" },
];

export const CAPTION_ANIMATIONS = [
  { id: "spring_bounce", label: "🔥 Spring Bounce / ارتداد حركي مرن (ترند)", desc: "Shorts & Reels favorite: elastic bouncy overshoot with playful micro-tilt" },
  { id: "word_pop", label: "💥 Word Pop Punch / تفجير الكلمات (ترند)", desc: "MrBeast & Hormozi style: active word explosively enlarges with highlight" },
  { id: "karaoke", label: "✨ Karaoke Glow / كاريوكي مضيء (ترند)", desc: "Current spoken word illuminates with glowing neon halo and micro-zoom" },
  { id: "glitch_flicker", label: "⚡ Glitch Flicker / وميض ديجيتال سريع", desc: "Digital RGB chromatic flicker entrance for mystery, tech & documentary" },
  { id: "typewriter", label: "⌨️ Typewriter / كتابة تدريجية", desc: "Reveals letter by letter with typing cursor" },
  { id: "word_by_word", label: "🔤 Word Reveal / ظهور كلمة بكلمة", desc: "Words pop in one by one timed with audio" },
  { id: "pop", label: "🎈 Pop In / انبثاق ناعم", desc: "Smooth spring pop entrance" },
  { id: "slide", label: "⬆️ Slide Up / صعود ناعم", desc: "Smooth rise and fade entrance" },
  { id: "glow", label: "💫 Pulse Glow / توهج نبضي", desc: "Rhythmic neon pulse glow" },
  { id: "zoom", label: "🔍 Zoom In / تكبير سينمائي", desc: "Smooth cinematic scale-in" },
  { id: "none", label: "⏸️ Static / ثابت", desc: "Clean static text" },
];

// One-click Trending YouTube Automation Presets
export const CAPTION_VIRAL_PRESETS = [
  {
    id: "hormozi_viral",
    name: "⚡ Hormozi Shorts",
    nameAr: "⚡ هورموزي فايرال",
    desc: "Ultra-bold yellow with heavy stroke & word pop",
    style: "hormozi",
    animation: "word_pop",
    color: "#FFE600",
    font: "montserrat",
    size: "lg",
    position: 25,
  },
  {
    id: "beast_pop",
    name: "🔥 MrBeast Kinetic",
    nameAr: "🔥 مستر بيست حركي",
    desc: "Cyan punch, comic pop angle & spring bounce",
    style: "beast",
    animation: "spring_bounce",
    color: "#00F0FF",
    font: "anton",
    size: "lg",
    position: 28,
  },
  {
    id: "vox_doc",
    name: "📰 Vox Explainer",
    nameAr: "📰 فوكس الوثائقي",
    desc: "Lower-third documentary bar with gold underline",
    style: "vox",
    animation: "slide",
    color: "#FFFFFF",
    font: "poppins",
    size: "md",
    position: 12,
  },
  {
    id: "magnates_doc",
    name: "👑 Magnates Luxury",
    nameAr: "👑 ماغنيتس الفاخر",
    desc: "Burnished gold glow for video essays",
    style: "magnates",
    animation: "glow",
    color: "#F6E09C",
    font: "montserrat",
    size: "md",
    position: 16,
  },
  {
    id: "gadzhi_luxury",
    name: "💎 Iman Minimal",
    nameAr: "💎 إيمان قادجي مينيمال",
    desc: "Frosted glass pill, wide tracking & smooth slide",
    style: "gadzhi",
    animation: "slide",
    color: "#FFFFFF",
    font: "montserrat",
    size: "md",
    position: 18,
  },
  {
    id: "cyber_neon",
    name: "🎮 Cyber Neon",
    nameAr: "🎮 سايبر نيون",
    desc: "Synthwave cyan & magenta karaoke pulse",
    style: "cyber",
    animation: "karaoke",
    color: "#00F0FF",
    font: "anton",
    size: "md",
    position: 22,
  },
];

// Current caption cue object for time t (null if none).
export function captionCueAt(cues, t) {
  if (!cues || !cues.length) return null;
  for (let i = 0; i < cues.length; i++) {
    if (t >= cues[i].start && t < cues[i].end) return cues[i];
  }
  return null;
}

// ---- preview: draw the current caption onto the canvas ----
export function drawCaption(ctx, text, W, H, styleId, fontPx, lineHeight, fontFamily = "CaptionFont", position = 0, options = {}) {
  if (!text) return;
  const {
    color = null,
    animation = "none",
    t = 0,
    start = 0,
    end = 0,
  } = options || {};

  const st = CAPTION_STYLES[styleId] || CAPTION_STYLES.classic;
  const dur = Math.max(0.08, end - start);
  const elapsed = Math.max(0, t - start);
  const progress = dur > 0 ? Math.min(1, Math.max(0, elapsed / dur)) : 1;

  // Kinetic writing animations: Typewriter (letter by letter) & Word Reveal (word by word)
  let effectiveText = text;
  if (animation === "typewriter" && dur > 0) {
    const charProg = Math.min(1, elapsed / (dur * 0.82));
    const charsToShow = Math.max(1, Math.floor(charProg * text.length));
    const isTyping = charsToShow < text.length;
    effectiveText = text.slice(0, charsToShow);
    if (isTyping && Math.floor(elapsed * 6) % 2 === 0) {
      effectiveText += " ▎";
    }
  } else if (animation === "word_by_word" && dur > 0) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const wordProg = Math.min(1, elapsed / (dur * 0.85));
      const wordsCount = Math.max(1, Math.min(words.length, Math.ceil(wordProg * words.length)));
      effectiveText = words.slice(0, wordsCount).join(" ");
    }
  }

  const lines = wrapToWidth(effectiveText, captionMaxChars(W, fontPx));
  const n = lines.length;
  if (n === 0) return;
  const lhf = lineHeight > 0 ? lineHeight : lineHeightFactor(st);

  ctx.save();

  // Animation transforms (Spring Bounce, Word Pop, Glitch Flicker, Pop, Slide, Zoom)
  let scale = 1;
  let offsetY = 0;
  let glitchOffset = 0;

  if (animation === "spring_bounce" && elapsed < 0.38) {
    // Elastic spring physics with overshoot: 0.8 -> 1.25 -> 0.94 -> 1.02 -> 1.0
    const p = elapsed / 0.38;
    const damp = Math.exp(-p * 4.4);
    scale = 1 - Math.cos(p * Math.PI * 2.8) * 0.42 * damp;
    const tilt = Math.sin(p * Math.PI * 2) * 2.4 * damp;
    ctx.rotate((tilt * Math.PI) / 180);
  } else if (animation === "pop" && elapsed < 0.32) {
    const p = elapsed / 0.32;
    scale = 0.8 + Math.sin(p * Math.PI) * 0.38 + p * 0.2;
  } else if (animation === "slide" && elapsed < 0.26) {
    const p = elapsed / 0.26;
    const ease = Math.sin((p * Math.PI) / 2);
    offsetY = (1 - ease) * (fontPx * 0.45);
    ctx.globalAlpha = 0.25 + 0.75 * ease;
  } else if (animation === "zoom" && elapsed < 0.28) {
    const p = elapsed / 0.28;
    scale = 0.82 + 0.18 * Math.sin((p * Math.PI) / 2);
    ctx.globalAlpha = 0.4 + 0.6 * p;
  } else if (animation === "glitch_flicker" && elapsed < 0.25) {
    const flickerP = elapsed / 0.25;
    if (Math.sin(flickerP * 24) > 0.2) {
      glitchOffset = (Math.sin(elapsed * 40) > 0 ? 1 : -1) * (fontPx * 0.08);
      ctx.globalAlpha = 0.85;
    }
  }

  // Comic angle tilt for MrBeast preset if present
  if (st.tilt) {
    ctx.rotate((st.tilt * Math.PI) / 180);
  }

  const centerY = lineTop(H, fontPx, n, Math.floor(n / 2), lhf, position);
  if (scale !== 1 || offsetY !== 0 || glitchOffset !== 0) {
    ctx.translate(W / 2, centerY);
    if (scale !== 1) ctx.scale(scale, scale);
    if (offsetY !== 0 || glitchOffset !== 0) ctx.translate(glitchOffset, offsetY);
    ctx.translate(-W / 2, -centerY);
  }

  ctx.font = `800 ${fontPx}px "${fontFamily}", "CaptionFont", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Full-width bar behind the whole caption block
  if (st.bar) {
    const top = lineTop(H, fontPx, n, 0, lhf, position) - fontPx * 0.9;
    const barH = n * fontPx * lhf + fontPx * 0.5;
    ctx.fillStyle = st.bar;
    ctx.fillRect(0, top, W, barH);
  }

  const textColor = color || st.fill;

  for (let i = 0; i < n; i++) {
    const ln = lines[i];
    const top = lineTop(H, fontPx, n, i, lhf, position);
    const base = top + fontPx * 0.82;
    const textWidth = ctx.measureText(ln).width;

    // Boxed or Pill Background
    if (st.box) {
      const padX = fontPx * (st.pill ? 0.55 : 0.38);
      const padY = fontPx * (st.pill ? 0.18 : 0.12);
      const boxTop = base - fontPx * 0.78 - padY;
      const boxH = fontPx * 0.98 + padY * 2;
      const boxW = textWidth + padX * 2;
      const boxX = (W - textWidth) / 2 - padX;

      ctx.save();
      ctx.fillStyle = st.box;
      if (st.pill && typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(boxX, boxTop, boxW, boxH, fontPx * 0.35);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.fillRect(boxX, boxTop, boxW, boxH);
      }
      ctx.restore();
    }

    // Vox style: golden marker underline
    if (st.accentUnderline) {
      ctx.save();
      ctx.fillStyle = st.accentUnderline;
      const ulH = Math.max(3, Math.round(fontPx * 0.08));
      const ulY = base + fontPx * 0.16;
      ctx.fillRect((W - textWidth) / 2, ulY, textWidth, ulH);
      ctx.restore();
    }

    // Glow / Neon Shadow
    if (animation === "glow" || st.neonAura) {
      const pulse = Math.sin(elapsed * 6) * 0.5 + 0.5;
      ctx.shadowColor = st.neonAura || color || "#00F0FF";
      ctx.shadowBlur = fontPx * (0.24 + pulse * 0.36);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (st.shadow) {
      ctx.shadowColor = st.shadow.color;
      ctx.shadowBlur = fontPx * (st.shadow.blur || 0);
      ctx.shadowOffsetX = st.shadow.offX != null ? st.shadow.offX : 0;
      ctx.shadowOffsetY = st.shadow.offY != null ? st.shadow.offY : fontPx * 0.04;
    }

    // Kinetic Word-level highlighting (Karaoke & Word Pop)
    if (animation === "karaoke" || animation === "word_pop") {
      const words = ln.split(" ");
      const totalWords = words.length;
      const activeIdx = Math.min(totalWords - 1, Math.floor(progress * totalWords));
      const totalW = ctx.measureText(ln).width;
      let curX = (W - totalW) / 2;

      for (let wi = 0; wi < totalWords; wi++) {
        const word = words[wi];
        const space = wi < totalWords - 1 ? " " : "";
        const wordText = word + space;
        const wWidth = ctx.measureText(wordText).width;
        const isCurrent = wi === activeIdx;
        const isPast = wi < activeIdx;

        ctx.save();
        ctx.textAlign = "left";

        // Dynamic scale punch for active word
        if (isCurrent && animation === "word_pop") {
          const wordElapsed = (progress * totalWords) - wi;
          const popBounce = Math.max(1, 1.25 - wordElapsed * 0.3);
          ctx.translate(curX + wWidth / 2, base - fontPx * 0.35);
          ctx.scale(popBounce, popBounce);
          ctx.translate(-(curX + wWidth / 2), -(base - fontPx * 0.35));
        }

        if (st.stroke) {
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          ctx.lineWidth = Math.max(2, fontPx / 6.5) * (st.strokeW || 1);
          ctx.strokeStyle = st.stroke;
          ctx.strokeText(wordText, curX, base);
        }

        if (isCurrent) {
          // Vibrant punch highlight
          ctx.fillStyle = color && color !== "#FFFFFF" ? color : "#FFE600";
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = fontPx * 0.35;
        } else if (isPast) {
          ctx.fillStyle = textColor;
        } else {
          ctx.fillStyle = textColor;
          ctx.globalAlpha = 0.52;
        }

        ctx.fillText(wordText, curX, base);
        ctx.restore();
        curX += wWidth;
      }
    } else {
      // Standard line render
      if (st.stroke) {
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.lineWidth = Math.max(2, fontPx / 6.5) * (st.strokeW || 1);
        ctx.strokeStyle = st.stroke;
        ctx.strokeText(ln, W / 2, base);
      }
      ctx.fillStyle = textColor;
      ctx.fillText(ln, W / 2, base);
    }

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowOffsetX = 0;
  }
  ctx.restore();
}

// ---- render: one centered drawtext per LINE (so each line is centered) ----
// Returns the filter chain plus the per-line textfiles to write into the FS.
export function buildCaptionBurn(cues, styleId, width, height, sizeId, lineHeight, fontScale, position = 0) {
  const st = CAPTION_STYLES[styleId] || CAPTION_STYLES.classic;
  const fs = captionFontPx(height, sizeId, fontScale);
  const bw = Math.max(2, Math.round(fs / 9));
  const lhf = lineHeight > 0 ? lineHeight : lineHeightFactor(st);
  const files = [];
  const filters = [];
  let li = 0;
  for (const c of cues) {
    const lines = wrapToWidth(c.text, captionMaxChars(width, fs));
    const n = lines.length;
    const s = c.start.toFixed(3), e = c.end.toFixed(3);
    for (let i = 0; i < n; i++) {
      const name = captionCueFile(li++);
      files.push({ name, text: sanitizeCueText(lines[i]) });
      const y = lineTop(height, fs, n, i, lhf, position);
      filters.push(
        `drawtext=fontfile=${CAPTION_FONT}:textfile=${name}:${st.dt(bw, fs)}` +
        `:fontsize=${fs}:x=(w-text_w)/2:y=${y}:enable=between(t\\,${s}\\,${e})`
      );
    }
  }
  return { filter: filters.join(","), files };
}

// drawtext reads textfiles literally; strip chars its expander would choke on.
export function sanitizeCueText(text) {
  return String(text).replace(/\\/g, "").replace(/%/g, "percent");
}

// ============================================================================
// AI AUTO CAPTION EFFECTS (OVERLAYS) - TRENDING YOUTUBE AUTOMATION ENGINE
// ============================================================================

export const OVERLAY_CATEGORIES = [
  { id: "reaction", label: "Reaction / ردة فعل", icon: "💥", color: "#FFE600", desc: "WOW!, OH NO!, WAIT!, UNBELIEVABLE!" },
  { id: "number", label: "Number / رقم إحصائي", icon: "💰", color: "#00FF66", desc: "Important numbers, percentages, currency ($1M, 500%)" },
  { id: "keyword", label: "Keyword / كلمة مفتاحية", icon: "🚨", color: "#00F0FF", desc: "DANGER, SECRET, TRUTH, WARNING" },
  { id: "revelation", label: "Revelation / كشف هام", icon: "💡", color: "#F59E0B", desc: "THE REAL TRUTH, IT WAS A LIE" },
  { id: "emphasis", label: "Emphasis / تأكيد قوي", icon: "⚡", color: "#FF2A85", desc: "PAY ATTENTION, LOOK AT THIS, REMEMBER" },
];

export const OVERLAY_STYLES = [
  { id: "beast", label: "MrBeast 3D Comic / مستر بيست ثلاثي الأبعاد", icon: "💥", desc: "3D extruded pop shadow with comic tilt & gradient" },
  { id: "hormozi", label: "Alex Hormozi Punch / هورموزي الصندوق الأسود", icon: "⚡", desc: "Black pill with radioactive green/yellow high-retention text" },
  { id: "vox", label: "Vox Motion Bar / شريط فوكس الوثائقي", icon: "🎬", desc: "Documentary bar with warm golden marker highlight" },
  { id: "cyber", label: "Cyber Stats HUD / سايبر نيون", icon: "🔢", desc: "Glowing tech data pill with neon aura and bracketed corners" },
  { id: "magnates", label: "Magnates 24K Gold / ماغنيتس الفاخر", icon: "👑", desc: "Deep luxury noir with 24k gold gradient and cinematic glow" },
  { id: "alert", label: "Breaking Warning / تحذير عاجل", icon: "🚨", desc: "Urgent red hazard badge for critical moments and mistakes" },
];

export const OVERLAY_ANIMATIONS = [
  { id: "spring_bounce", label: "Spring Bounce / ارتداد مرن", desc: "Elastic bounce overshoot with slight comic tilt" },
  { id: "word_pop", label: "Word Pop / انفجار حركي", desc: "Scale pulse explosion on entrance" },
  { id: "glitch_flicker", label: "Glitch Flicker / وميض رقمي", desc: "High-tech chromatic RGB offset flicker" },
  { id: "zoom", label: "Zoom Punch / تقريب سريع", desc: "Crash zoom into focus" },
  { id: "pop", label: "Pop In / انبثاق ناعم", desc: "Fast scale pop from 0 to 1" },
  { id: "slide", label: "Slide Up / صعود ناعم", desc: "Smooth rise from below" },
  { id: "glow", label: "Pulse Glow / توهج نبضي", desc: "Radiant pulsating neon aura" },
];

// Draw an AI Auto Caption Effect Overlay on the canvas with 3D extrusion,
// viral gradients, smart composition awareness, and aspect-ratio safe margins.
export function drawCaptionOverlay(ctx, overlay, W, H, t, fontFamily = "CaptionFont", sceneContext = {}) {
  if (!overlay || !overlay.text) return;
  const {
    start = 0,
    end = 0,
    text = "",
    category = "emphasis",
    animation = "spring_bounce",
    style = "beast",
    color = null,
    position = "auto", // "auto" or number 0-100
    scale: customScale = 1,
    emoji: customEmoji = null,
  } = overlay;

  if (t < start || t >= end) return;
  const dur = Math.max(0.1, end - start);
  const elapsed = Math.max(0, t - start);

  ctx.save();

  // Animation dynamics
  let animScale = 1;
  let offsetY = 0;
  let tiltDeg = 0;
  let alpha = 1;

  if (animation === "spring_bounce" && elapsed < 0.38) {
    const p = elapsed / 0.38;
    const damp = Math.exp(-p * 4.4);
    animScale = 1 - Math.cos(p * Math.PI * 2.8) * 0.45 * damp;
    tiltDeg = Math.sin(p * Math.PI * 2) * 2.8 * damp;
  } else if (animation === "word_pop") {
    if (elapsed < 0.25) {
      const p = elapsed / 0.25;
      animScale = 0.72 + Math.sin(p * Math.PI) * 0.52;
    }
  } else if (animation === "glitch_flicker" && elapsed < 0.28) {
    const flickerP = elapsed / 0.28;
    if (Math.sin(flickerP * 28) > 0.1) {
      offsetY = (Math.sin(elapsed * 40) > 0 ? 1 : -1) * (H * 0.015);
      alpha = 0.88;
    }
  } else if (animation === "zoom" && elapsed < 0.3) {
    const p = elapsed / 0.3;
    animScale = 0.75 + 0.25 * Math.sin((p * Math.PI) / 2);
  } else if (animation === "pop" && elapsed < 0.3) {
    const p = elapsed / 0.3;
    animScale = 0.8 + Math.sin(p * Math.PI) * 0.35;
  } else if (animation === "slide" && elapsed < 0.28) {
    const p = elapsed / 0.28;
    const ease = Math.sin((p * Math.PI) / 2);
    offsetY = (1 - ease) * (H * 0.06);
    alpha = 0.2 + 0.8 * ease;
  }

  // Smooth fade out in the last 0.15s
  const remaining = end - t;
  if (remaining < 0.15 && dur > 0.3) {
    alpha *= Math.max(0, remaining / 0.15);
  }

  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  // --------------------------------------------------------------------------
  // Smart Composition & Image Analysis Placement
  // --------------------------------------------------------------------------
  const aspect = sceneContext.aspect || (W < H ? "9:16" : "16:9");
  const isVertical = aspect === "9:16" || W < H;

  // Resolve vertical position
  let effectivePos = typeof position === "number" ? position : 50;
  if (position === "auto" || position == null) {
    if (isVertical) {
      // Shorts/TikTok focus zone: 48% - 62%
      effectivePos = category === "reaction" ? 64 : (category === "number" ? 54 : 50);
    } else {
      // 16:9 Widescreen: Avoid bottom subtitles (8% - 22%)
      effectivePos = category === "reaction" ? 72 : (category === "number" ? 58 : 62);
    }
  }

  // Safe vertical clamping
  const minSafe = isVertical ? 38 : 30; // Never touch bottom UI / captions
  const maxSafe = isVertical ? 76 : 82; // Never touch top header
  const clampedPos = Math.max(minSafe, Math.min(maxSafe, effectivePos));

  const posFrac = clampedPos / 100;
  const centerY = H - posFrac * H;
  const centerX = W / 2;

  // Adaptive Font Sizing based on word count & canvas dimensions
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let baseFrac = isVertical ? 0.095 : 0.072;
  if (wordCount === 1) baseFrac *= 1.2; // Single-word punch (e.g. "WOW!", "$1M")
  else if (wordCount >= 4) baseFrac *= 0.84; // Multi-word phrase

  let fontPx = Math.round(Math.min(W, H) * baseFrac * (customScale || 1));

  ctx.translate(centerX, centerY);
  if (animScale !== 1) ctx.scale(animScale, animScale);

  // Apply comic tilt for MrBeast / energetic reactions
  const effectiveTilt = (style === "beast" || category === "reaction") ? (tiltDeg || -2.8) : tiltDeg;
  if (effectiveTilt !== 0) ctx.rotate((effectiveTilt * Math.PI) / 180);
  if (offsetY !== 0) ctx.translate(0, offsetY);

  const fontName = fontFamily || "Montserrat";
  ctx.font = `900 ${fontPx}px "${fontName}", "Montserrat", "Anton", "Cairo", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const upperText = String(text).toUpperCase();

  // Resolve Category icon & emoji
  let emoji = customEmoji;
  if (!emoji) {
    if (category === "reaction") emoji = "💥";
    else if (category === "number") emoji = "💰";
    else if (category === "keyword") emoji = "🚨";
    else if (category === "revelation") emoji = "💡";
    else emoji = "⚡";
  }

  // Resolve theme color
  let themeColor = color;
  if (!themeColor) {
    if (style === "magnates") themeColor = "#F6E09C";
    else if (style === "alert") themeColor = "#FF2244";
    else if (category === "reaction") themeColor = "#FFE600";
    else if (category === "number") themeColor = "#00FF66";
    else if (category === "keyword") themeColor = "#00F0FF";
    else if (category === "revelation") themeColor = "#F59E0B";
    else themeColor = "#FF2A85";
  }

  // Text metrics and auto-fit to max width
  let measuredW = ctx.measureText(upperText).width;
  const maxAllowedW = W * (isVertical ? 0.82 : 0.86);
  if (measuredW > maxAllowedW) {
    // Dynamically downscale if text exceeds safe width
    const ratio = maxAllowedW / measuredW;
    fontPx = Math.max(18, Math.round(fontPx * ratio * 0.96));
    ctx.font = `900 ${fontPx}px "${fontName}", "Montserrat", "Anton", "Cairo", system-ui, sans-serif`;
    measuredW = ctx.measureText(upperText).width;
  }

  const emojiSpacing = emoji ? fontPx * 0.95 : 0;
  const totalContentW = measuredW + emojiSpacing;
  const padX = fontPx * 0.55;
  const padY = fontPx * 0.28;
  const badgeW = totalContentW + padX * 2;
  const badgeH = fontPx * 1.45;

  const textStartX = -totalContentW / 2 + emojiSpacing;

  // --------------------------------------------------------------------------
  // Render Trending Visual Styles
  // --------------------------------------------------------------------------

  if (style === "beast") {
    // 💥 1. MRBEAST 3D COMIC POP:
    // Heavy 3D Extrusion Shadow + Glossy Comic Sticker Border
    ctx.save();

    // Backdrop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-badgeW / 2 + 5, -badgeH / 2 + 6, badgeW, badgeH, fontPx * 0.35);
      ctx.fill();
    }

    // Outer Sticker Badge
    ctx.fillStyle = "#0c1017";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(3, fontPx * 0.08);
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, fontPx * 0.32);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
      ctx.strokeRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
    }
    ctx.restore();

    // 3D Extruded Black Shadow for Text (Multi-pass offset)
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(4, fontPx * 0.16);
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    const shadowDepth = Math.max(4, Math.round(fontPx * 0.12));
    for (let d = shadowDepth; d >= 1; d -= 2) {
      ctx.strokeText(upperText, textStartX + measuredW / 2 + d * 0.8, d * 0.9);
      ctx.fillText(upperText, textStartX + measuredW / 2 + d * 0.8, d * 0.9);
    }

    // Outer Stroke
    ctx.lineWidth = Math.max(4, fontPx * 0.15);
    ctx.strokeText(upperText, textStartX + measuredW / 2, 0);

    // Vibrant Yellow-Gold / Cyan Gradient Fill
    const grad = ctx.createLinearGradient(0, -fontPx * 0.6, 0, fontPx * 0.6);
    grad.addColorStop(0, "#FFF95B");
    grad.addColorStop(0.5, themeColor || "#FFE600");
    grad.addColorStop(1, "#FF9500");
    ctx.fillStyle = grad;
    ctx.fillText(upperText, textStartX + measuredW / 2, 0);
    ctx.restore();

  } else if (style === "hormozi") {
    // ⚡ 2. ALEX HORMOZI PUNCH:
    // Pure black pill + radioactive green/yellow contrast punch
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
    ctx.strokeStyle = themeColor || "#00FF44";
    ctx.lineWidth = Math.max(3, fontPx * 0.09);
    ctx.shadowColor = themeColor || "#00FF44";
    ctx.shadowBlur = fontPx * 0.4;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, fontPx * 0.28);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
      ctx.strokeRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
    }
    ctx.restore();

    // Hormozi Ultra Bold Punch Text
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, fontPx * 0.12);
    ctx.strokeStyle = "#000000";
    ctx.strokeText(upperText, textStartX + measuredW / 2, 0);

    ctx.fillStyle = themeColor || "#FFE600";
    ctx.fillText(upperText, textStartX + measuredW / 2, 0);
    ctx.restore();

  } else if (style === "magnates") {
    // 👑 3. MAGNATES MEDIA 24K GOLD:
    // Deep obsidian luxury noir with 24K gold border & metallic gold gradient
    ctx.save();
    ctx.fillStyle = "rgba(10, 8, 6, 0.94)";
    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth = Math.max(2, fontPx * 0.06);
    ctx.shadowColor = "rgba(212, 175, 55, 0.5)";
    ctx.shadowBlur = fontPx * 0.35;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
      ctx.strokeRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
    }
    ctx.restore();

    // 24K Gold Gradient Text
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, fontPx * 0.08);
    ctx.strokeStyle = "#000000";
    ctx.strokeText(upperText, textStartX + measuredW / 2, 0);

    const goldGrad = ctx.createLinearGradient(0, -fontPx * 0.5, 0, fontPx * 0.5);
    goldGrad.addColorStop(0, "#FFF5C0");
    goldGrad.addColorStop(0.45, "#E2B842");
    goldGrad.addColorStop(1, "#946E18");
    ctx.fillStyle = goldGrad;
    ctx.fillText(upperText, textStartX + measuredW / 2, 0);
    ctx.restore();

  } else if (style === "cyber") {
    // 🔢 4. CYBER STATS HUD:
    // Glowing bracketed HUD with neon cyan/green data aura
    ctx.save();
    ctx.fillStyle = "rgba(6, 12, 24, 0.94)";
    ctx.strokeStyle = themeColor || "#00F0FF";
    ctx.lineWidth = Math.max(2, fontPx * 0.07);
    ctx.shadowColor = themeColor || "#00F0FF";
    ctx.shadowBlur = fontPx * 0.45;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, fontPx * 0.45);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
      ctx.strokeRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
    }

    // Bracketed corner ticks [  ]
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    const cw = 8, ch = 8;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(-badgeW / 2 + cw, -badgeH / 2);
    ctx.lineTo(-badgeW / 2, -badgeH / 2);
    ctx.lineTo(-badgeW / 2, -badgeH / 2 + ch);
    // Top-right
    ctx.moveTo(badgeW / 2 - cw, -badgeH / 2);
    ctx.lineTo(badgeW / 2, -badgeH / 2);
    ctx.lineTo(badgeW / 2, -badgeH / 2 + ch);
    ctx.stroke();
    ctx.restore();

    // Cyber Neon Text
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, fontPx * 0.12);
    ctx.strokeStyle = "#000000";
    ctx.strokeText(upperText, textStartX + measuredW / 2, 0);

    ctx.fillStyle = themeColor || "#00FF66";
    ctx.shadowColor = themeColor || "#00FF66";
    ctx.shadowBlur = fontPx * 0.3;
    ctx.fillText(upperText, textStartX + measuredW / 2, 0);
    ctx.restore();

  } else if (style === "alert") {
    // 🚨 5. BREAKING / DANGER ALERT:
    // Red/Orange hazard stripe alert with high-voltage urgency
    ctx.save();
    ctx.fillStyle = "rgba(22, 4, 8, 0.96)";
    ctx.strokeStyle = "#FF1E56";
    ctx.lineWidth = Math.max(3, fontPx * 0.09);
    ctx.shadowColor = "rgba(255, 30, 86, 0.6)";
    ctx.shadowBlur = fontPx * 0.4;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
      ctx.strokeRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
    }
    ctx.restore();

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, fontPx * 0.14);
    ctx.strokeStyle = "#000000";
    ctx.strokeText(upperText, textStartX + measuredW / 2, 0);

    const alertGrad = ctx.createLinearGradient(0, -fontPx * 0.5, 0, fontPx * 0.5);
    alertGrad.addColorStop(0, "#FF8DA1");
    alertGrad.addColorStop(1, "#FF003C");
    ctx.fillStyle = alertGrad;
    ctx.fillText(upperText, textStartX + measuredW / 2, 0);
    ctx.restore();

  } else {
    // 🎬 6. VOX DOCUMENTARY BAR (Default Fallback)
    ctx.save();
    ctx.fillStyle = "rgba(10, 14, 20, 0.92)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1.5;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 6);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
      ctx.strokeRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
    }

    // Warm golden marker underline
    ctx.fillStyle = themeColor || "#F59E0B";
    const ulH = Math.max(3, Math.round(fontPx * 0.09));
    ctx.fillRect(-totalContentW / 2, badgeH / 2 - ulH - 3, totalContentW, ulH);
    ctx.restore();

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, fontPx * 0.11);
    ctx.strokeStyle = "#000000";
    ctx.strokeText(upperText, textStartX + measuredW / 2, -1);

    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(upperText, textStartX + measuredW / 2, -1);
    ctx.restore();
  }

  // Draw Emoji / Icon Sticker
  if (emoji) {
    ctx.save();
    ctx.font = `${Math.round(fontPx * 1.05)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, -totalContentW / 2 + fontPx * 0.42, 0);
    ctx.restore();
  }

  ctx.restore();
}

// Smart heuristic overlay generator (used locally or as reliable fallback)
export function generateHeuristicOverlays(cues = []) {
  if (!Array.isArray(cues) || cues.length === 0) return [];
  const overlays = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const text = String(cue.text || "").trim();
    if (!text) continue;

    // Ensure at least 5-8 seconds spacing between overlays to avoid clutter
    const tooClose = overlays.some((o) => Math.abs(o.start - cue.start) < 6);
    if (tooClose && overlays.length >= 8) continue;

    const lower = text.toLowerCase();
    let detected = null;

    // 1. Detect Numbers & Currency & Percentages (Alex Hormozi / Cyber Stats)
    const numMatch = text.match(/(\$\s*\d+[\d,.]*(?:\s*(?:k|m|b|million|billion|trillion|ألف|مليون|مليار))?|\d+[\d,.]*%\s*|\d+x\b|\b\d{2,}[\d,.]*\b)/i);
    if (numMatch && !tooClose) {
      detected = {
        text: numMatch[0].trim(),
        category: "number",
        animation: "word_pop",
        style: "cyber",
        color: "#00FF66",
        position: 54,
        emoji: "💰",
      };
    }

    // 2. Detect Shock & Viral Reactions (MrBeast Comic Style)
    if (!detected && !tooClose) {
      if (/\b(wait|what\?|wow|no way|omg|oh no|unbelievable|impossible|shocking|مهلا|ماذا|مستحيل|صدمة|لا يعقل)\b/i.test(lower)) {
        let reactionWord = "WAIT!";
        let em = "💥";
        if (/wow|رائع|مدهش/i.test(lower)) { reactionWord = "WOW!"; em = "🔥"; }
        else if (/oh no|no way|كارثة|مصيبة/i.test(lower)) { reactionWord = "OH NO!"; em = "😱"; }
        else if (/unbelievable|impossible|مستحيل/i.test(lower)) { reactionWord = "UNBELIEVABLE!"; em = "🤯"; }
        else if (/what\?|ماذا/i.test(lower)) { reactionWord = "WAIT WHAT?!"; em = "👀"; }

        detected = {
          text: reactionWord,
          category: "reaction",
          animation: "spring_bounce",
          style: "beast",
          color: "#FFE600",
          position: 62,
          emoji: em,
        };
      }
    }

    // 3. Detect Revelations & Turning Points (Magnates / Vox Style)
    if (!detected && !tooClose) {
      if (/\b(truth|secret|actually|turned out|revealed|the reason|realized|الحقيقة|السر|اتضح|السبب|اكتشف)\b/i.test(lower)) {
        detected = {
          text: lower.includes("secret") || lower.includes("السر") ? "THE SECRET" : "THE REAL TRUTH",
          category: "revelation",
          animation: "slide",
          style: "vox",
          color: "#F59E0B",
          position: 65,
          emoji: "💡",
        };
      }
    }

    // 4. Detect Keywords & Warnings (Breaking Alert Style)
    if (!detected && !tooClose) {
      if (/\b(danger|warning|critical|mistake|failure|never|stop|تحذير|خطر|خطأ|فشل|توقف|إياك)\b/i.test(lower)) {
        let kw = "WARNING!";
        if (/danger|خطر/i.test(lower)) kw = "DANGER!";
        else if (/mistake|خطأ/i.test(lower)) kw = "BIG MISTAKE!";
        else if (/never|stop|توقف|إياك/i.test(lower)) kw = "NEVER DO THIS!";

        detected = {
          text: kw,
          category: "keyword",
          animation: "glitch_flicker",
          style: "alert",
          color: "#FF1E56",
          position: 52,
          emoji: "🚨",
        };
      }
    }

    // 5. Detect Emphasis (Hormozi Punch Box Style)
    if (!detected && !tooClose && i % 4 === 1) {
      if (/\b(look|listen|remember|important|key|notice|ركز|انتبه|تذكر|هام|الأهم)\b/i.test(lower)) {
        detected = {
          text: lower.includes("look") || lower.includes("انتبه") ? "LOOK AT THIS!" : "PAY ATTENTION!",
          category: "emphasis",
          animation: "spring_bounce",
          style: "hormozi",
          color: "#00FF44",
          position: 50,
          emoji: "⚡",
        };
      }
    }

    if (detected) {
      const start = Math.max(0, +cue.start.toFixed(2));
      const end = Math.max(start + 1.2, +(cue.start + Math.min(2.0, Math.max(1.2, cue.end - cue.start))).toFixed(2));
      const id = `eff_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      overlays.push({
        id,
        ...detected,
        start,
        end,
        approved: true,
        cueRefIndex: i,
      });
    }
  }

  // Ensure 3 to 6 high-retention overlays exist across the transcript
  if (overlays.length < 3 && cues.length >= 3) {
    const step = Math.max(1, Math.floor(cues.length / 4));
    for (let s = 0; s < cues.length; s += step) {
      if (overlays.some((o) => Math.abs(o.start - cues[s].start) < 4)) continue;
      const c = cues[s];
      overlays.push({
        id: `eff_def_${s}_${Date.now()}`,
        text: s === 0 ? "PAY ATTENTION!" : (s === step ? "LOOK AT THIS" : "IMPORTANT!"),
        category: "emphasis",
        animation: "spring_bounce",
        style: "hormozi",
        color: "#FFE600",
        position: 52,
        emoji: "⚡",
        start: +c.start.toFixed(2),
        end: +(c.start + 1.6).toFixed(2),
        approved: true,
        cueRefIndex: s,
      });
      if (overlays.length >= 5) break;
    }
  }

  return overlays.sort((a, b) => a.start - b.start);
}

