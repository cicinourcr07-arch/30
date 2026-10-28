// Transition definitions shared by the preview (canvas) and the export (ffmpeg
// xfade). Each has an `xfade` name (null = hard cut) and a `canvas` painter so
// the preview matches the rendered result closely.

export const DEFAULT_TRANSITION_DURATION = 0.4;
export const MIN_TRANSITION_DURATION = 0.15;
export const MAX_TRANSITION_DURATION = 1.0;

// Draw an image contained in WxH, optionally zoomed by `scale` about the centre
// so transitions can blend two images at their current Ken Burns zoom.
function paint(ctx, img, W, H, scale = 1) {
  if (!img) return; // no image = black (gap / lead-in)
  // HTMLImageElement=naturalWidth; <video>=videoWidth; VideoFrame=displayWidth; ImageBitmap=width.
  const iw = img.naturalWidth || img.videoWidth || img.displayWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.displayHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.min(W / iw, H / ih) * scale;
  const w = iw * s;
  const h = ih * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

// Each canvas painter receives a black-filled context and blends `from` -> `to`
// as progress p goes 0 -> 1. `sf`/`st` are the from/to images' zoom scales.
export const TRANSITIONS = {
  // ---- 🔥 YouTube Automation Trending Transitions ----
  whippan_left: {
    label: "Whip Pan Left", labelAr: "حركة سريعة لليسار", icon: "⇇", category: "trend", badge: "🔥 TREND",
    xfade: "slideleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      // High-speed non-linear whip acceleration
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const dx = -W * ease;
      const blurAmt = Math.sin(p * Math.PI) * (W * 0.04);
      if (blurAmt > 2) {
        c.save();
        c.globalAlpha = 0.35;
        c.translate(dx - blurAmt, 0); paint(c, f, W, H, sf);
        c.translate(blurAmt * 2, 0); paint(c, f, W, H, sf);
        c.restore();
        c.save();
        c.globalAlpha = 0.35;
        c.translate(W + dx - blurAmt, 0); paint(c, t, W, H, st);
        c.translate(blurAmt * 2, 0); paint(c, t, W, H, st);
        c.restore();
      }
      c.save(); c.translate(dx, 0); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(W + dx, 0); paint(c, t, W, H, st); c.restore();
    },
  },
  whippan_right: {
    label: "Whip Pan Right", labelAr: "حركة سريعة لليمين", icon: "⇉", category: "trend", badge: "🔥 TREND",
    xfade: "slideright",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const dx = W * ease;
      const blurAmt = Math.sin(p * Math.PI) * (W * 0.04);
      if (blurAmt > 2) {
        c.save();
        c.globalAlpha = 0.35;
        c.translate(dx - blurAmt, 0); paint(c, f, W, H, sf);
        c.translate(blurAmt * 2, 0); paint(c, f, W, H, sf);
        c.restore();
        c.save();
        c.globalAlpha = 0.35;
        c.translate(-W + dx - blurAmt, 0); paint(c, t, W, H, st);
        c.translate(blurAmt * 2, 0); paint(c, t, W, H, st);
        c.restore();
      }
      c.save(); c.translate(dx, 0); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(-W + dx, 0); paint(c, t, W, H, st); c.restore();
    },
  },
  glitch: {
    label: "Glitch RGB", labelAr: "تشويش رقمي وتفكك لوني", icon: "⚡", category: "trend", badge: "🔥 TREND",
    xfade: "dissolve",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const isFirst = p < 0.48;
      const baseImg = isFirst ? f : t;
      const scale = isFirst ? sf : st;
      paint(c, baseImg, W, H, scale);

      const glitchAmt = Math.sin(p * Math.PI);
      if (glitchAmt > 0.06) {
        // Displaced horizontal bands
        const numSlices = 7;
        const sliceH = H / numSlices;
        for (let i = 0; i < numSlices; i++) {
          if ((i + Math.floor(p * 8)) % 2 === 0) {
            const shift = Math.sin(p * 20 + i * 2.8) * (W * 0.05 * glitchAmt);
            c.save();
            c.beginPath();
            c.rect(0, i * sliceH, W, sliceH);
            c.clip();
            c.translate(shift, 0);
            paint(c, baseImg, W, H, scale);
            c.restore();
          }
        }

        // Chromatic Aberration RGB split overlay
        c.save();
        c.globalCompositeOperation = "screen";
        c.globalAlpha = glitchAmt * 0.45;
        c.translate(W * 0.015 * glitchAmt, 0);
        c.fillStyle = "rgba(0, 240, 255, 0.3)";
        c.fillRect(0, 0, W, H);
        c.restore();

        c.save();
        c.globalCompositeOperation = "screen";
        c.globalAlpha = glitchAmt * 0.4;
        c.translate(-W * 0.015 * glitchAmt, 0);
        c.fillStyle = "rgba(255, 0, 100, 0.28)";
        c.fillRect(0, 0, W, H);
        c.restore();

        // Digital Scanlines
        c.save();
        c.fillStyle = "rgba(0, 0, 0, 0.32)";
        for (let y = 0; y < H; y += 7) {
          c.fillRect(0, y, W, 2);
        }
        c.restore();
      }
    },
  },
  hyperzoom: {
    label: "Hyper Zoom Bloom", labelAr: "زووم انفجاري مع توهج", icon: "💥", category: "trend", badge: "🔥 TREND",
    xfade: "zoomin",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      if (p < 0.5) {
        const pNorm = p * 2;
        paint(c, f, W, H, sf * (1 + Math.pow(pNorm, 2) * 1.5));
      } else {
        const pNorm = (p - 0.5) * 2;
        const scaleEase = 1.85 - Math.sin((pNorm * Math.PI) / 2) * 0.85;
        paint(c, t, W, H, st * scaleEase);
      }
      const bloom = Math.max(0, 1 - Math.abs(p - 0.5) * 4);
      if (bloom > 0) {
        const grad = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 1.7);
        grad.addColorStop(0, `rgba(255, 252, 235, ${bloom * 0.95})`);
        grad.addColorStop(0.35, `rgba(255, 215, 120, ${bloom * 0.65})`);
        grad.addColorStop(1, "rgba(255, 160, 50, 0)");
        c.save();
        c.globalCompositeOperation = "screen";
        c.fillStyle = grad;
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  lightleak: {
    label: "Light Leak Flare", labelAr: "تسريب ضوئي سينمائي", icon: "✨", category: "trend", badge: "🎬 DOC",
    xfade: "fade",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.globalAlpha = p;
      paint(c, t, W, H, st);
      c.globalAlpha = 1;

      const flare = Math.sin(p * Math.PI);
      if (flare > 0) {
        const sweepX = W * (p * 1.4 - 0.2);
        const grad = c.createRadialGradient(sweepX, H * 0.35, 15, sweepX, H * 0.35, W * 0.7);
        grad.addColorStop(0, `rgba(255, 250, 220, ${flare * 0.92})`);
        grad.addColorStop(0.3, `rgba(255, 160, 50, ${flare * 0.72})`);
        grad.addColorStop(0.65, `rgba(255, 45, 110, ${flare * 0.38})`);
        grad.addColorStop(1, "rgba(255, 0, 80, 0)");

        c.save();
        c.globalCompositeOperation = "screen";
        c.fillStyle = grad;
        c.fillRect(0, 0, W, H);

        const streakGrad = c.createLinearGradient(sweepX - W * 0.25, 0, sweepX + W * 0.25, H);
        streakGrad.addColorStop(0, "rgba(255, 200, 100, 0)");
        streakGrad.addColorStop(0.5, `rgba(255, 245, 200, ${flare * 0.52})`);
        streakGrad.addColorStop(1, "rgba(255, 100, 50, 0)");
        c.fillStyle = streakGrad;
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  filmroll: {
    label: "Film Roll Jump", labelAr: "دوران شريط سينمائي", icon: "🎞", category: "trend", badge: "🎬 DOC",
    xfade: "slidedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = p * p * (3 - 2 * p);
      const barH = H * 0.12;
      const totalDist = H + barH;
      const dy = totalDist * ease;

      c.save();
      c.translate(0, dy);
      paint(c, f, W, H, sf);
      c.restore();

      c.save();
      c.fillStyle = "#0c0d12";
      c.fillRect(0, dy - barH, W, barH);
      c.fillStyle = "rgba(255, 255, 255, 0.12)";
      const holeW = W * 0.04, holeH = barH * 0.5;
      for (let x = W * 0.05; x < W; x += W * 0.12) {
        c.fillRect(x, dy - barH + (barH - holeH) / 2, holeW, holeH);
      }
      c.restore();

      c.save();
      c.translate(0, dy - totalDist);
      paint(c, t, W, H, st);
      c.restore();
    },
  },
  spinwarp: {
    label: "Spin Warp", labelAr: "دوران حركي خاطف", icon: "🔄", category: "trend", badge: "⚡ FAST",
    xfade: "radial",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const isFirst = p < 0.5;
      const angle = isFirst
        ? (p * 2) * (Math.PI / 10)
        : -((1 - (p - 0.5) * 2) * (Math.PI / 10));
      const scale = isFirst
        ? 1 + Math.pow(p * 2, 2) * 0.38
        : 1 + Math.pow(1 - (p - 0.5) * 2, 2) * 0.38;

      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(angle);
      c.scale(scale, scale);
      c.translate(-W / 2, -H / 2);
      paint(c, isFirst ? f : t, W, H, isFirst ? sf : st);
      c.restore();

      const blur = Math.sin(p * Math.PI);
      if (blur > 0.18) {
        c.save();
        c.globalAlpha = blur * 0.28;
        c.fillStyle = "#ffffff";
        c.fillRect(0, 0, W, H);
        c.restore();
      }
    },
  },
  smoothslide: {
    label: "Smooth Push", labelAr: "انزلاق بارالاكس سلس", icon: "⇥", category: "trend", badge: "📐 CLEAN",
    xfade: "slideleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const ease = 1 - Math.pow(1 - p, 3);
      const dx = W * (1 - ease);

      c.save();
      c.translate(-W * ease * 0.32, 0);
      paint(c, f, W, H, sf);
      c.fillStyle = `rgba(0, 0, 0, ${ease * 0.35})`;
      c.fillRect(0, 0, W, H);
      c.restore();

      c.save();
      c.translate(dx, 0);
      const grad = c.createLinearGradient(0, 0, -W * 0.08, 0);
      grad.addColorStop(0, "rgba(0, 0, 0, 0.42)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      c.fillStyle = grad;
      c.fillRect(-W * 0.08, 0, W * 0.08, H);
      paint(c, t, W, H, st);
      c.restore();
    },
  },

  // ---- Classic & Built-in Transitions ----
  fade: {
    label: "Crossfade", labelAr: "تلاشي متقاطع", icon: "✕", category: "cinematic", xfade: "fade",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.globalAlpha = p;
      paint(c, t, W, H, st);
      c.globalAlpha = 1;
    },
  },
  zoomin: {
    label: "Zoom Punch", labelAr: "تقريب حركي", icon: "⊕", category: "dynamic", xfade: "zoomin",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf * (1 + p * 0.45));
      c.globalAlpha = p;
      paint(c, t, W, H, st * (0.75 + 0.25 * p));
      c.globalAlpha = 1;
    },
  },
  flash: {
    label: "Camera Flash", labelAr: "وميض الكاميرا", icon: "⚡", category: "dynamic", xfade: "fadegrays",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, p < 0.45 ? f : t, W, H, p < 0.45 ? sf : st);
      const flashAlpha = Math.max(0, 1 - Math.abs(p - 0.45) * 3.2);
      if (flashAlpha > 0) {
        c.fillStyle = "#fffbeb";
        c.globalAlpha = flashAlpha;
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
    },
  },
  fadeblack: {
    label: "Fade to Black", labelAr: "تلاشي للأسود", icon: "◐", category: "cinematic", xfade: "fadeblack",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      if (p < 0.5) { c.globalAlpha = 1 - 2 * p; paint(c, f, W, H, sf); }
      else { c.globalAlpha = 2 * p - 1; paint(c, t, W, H, st); }
      c.globalAlpha = 1;
    },
  },
  fadewhite: {
    label: "Fade to White", labelAr: "تلاشي للأبيض", icon: "◑", category: "cinematic", xfade: "fadewhite",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      if (p < 0.5) {
        paint(c, f, W, H, sf);
        c.fillStyle = "#ffffff";
        c.globalAlpha = p * 2;
        c.fillRect(0, 0, W, H);
      } else {
        paint(c, t, W, H, st);
        c.fillStyle = "#ffffff";
        c.globalAlpha = (1 - p) * 2;
        c.fillRect(0, 0, W, H);
      }
      c.globalAlpha = 1;
    },
  },
  slideleft: {
    label: "Slide Left", labelAr: "انزلاق لليسار", icon: "⇐", category: "classic", xfade: "slideleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(-W * p, 0); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(W * (1 - p), 0); paint(c, t, W, H, st); c.restore();
    },
  },
  slideright: {
    label: "Slide Right", labelAr: "انزلاق لليمين", icon: "⇒", category: "classic", xfade: "slideright",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(W * p, 0); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(-W * (1 - p), 0); paint(c, t, W, H, st); c.restore();
    },
  },
  wipeleft: {
    label: "Wipe Left", labelAr: "مسح لليسار", icon: "◀", category: "classic", xfade: "wipeleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath(); const x = W * (1 - p); c.rect(x, 0, W - x, H); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  wiperight: {
    label: "Wipe Right", labelAr: "مسح لليمين", icon: "▶", category: "classic", xfade: "wiperight",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath(); c.rect(0, 0, W * p, H); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  circleopen: {
    label: "Circle Open", labelAr: "دائرة تتسع", icon: "◎", category: "classic", xfade: "circleopen",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath();
      c.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * p, 0, Math.PI * 2); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  circleclose: {
    label: "Circle Close", labelAr: "دائرة تنغلق", icon: "◉", category: "classic", xfade: "circleclose",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, t, W, H, st);
      c.save(); c.beginPath();
      c.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * (1 - p), 0, Math.PI * 2); c.clip();
      paint(c, f, W, H, sf); c.restore();
    },
  },
  wipeup: {
    label: "Wipe Up", labelAr: "مسح للأعلى", icon: "▲", category: "classic", xfade: "wipeup",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath(); const y = H * (1 - p); c.rect(0, y, W, H - y); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  wipedown: {
    label: "Wipe Down", labelAr: "مسح للأسفل", icon: "▼", category: "classic", xfade: "wipedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath(); c.rect(0, 0, W, H * p); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  slideup: {
    label: "Slide Up", labelAr: "انزلاق للأعلى", icon: "⇑", category: "classic", xfade: "slideup",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(0, -H * p); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(0, H * (1 - p)); paint(c, t, W, H, st); c.restore();
    },
  },
  slidedown: {
    label: "Slide Down", labelAr: "انزلاق للأسفل", icon: "⇓", category: "classic", xfade: "slidedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(0, H * p); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(0, -H * (1 - p)); paint(c, t, W, H, st); c.restore();
    },
  },
  cut: {
    label: "Cut (None)", labelAr: "قطع مباشر بدون انتقال", icon: "⊘", category: "classic", xfade: null,
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => paint(c, t, W, H, st),
  },
};

export const TRANSITION_LIST = Object.keys(TRANSITIONS).map((id) => ({ id, ...TRANSITIONS[id] }));

export const TRANSITION_CATEGORIES = [
  { id: "all", label: "All / الكل" },
  { id: "trend", label: "🔥 الترند (Trending)" },
  { id: "cinematic", label: "🎬 سينمائي (Cinematic)" },
  { id: "dynamic", label: "⚡ حركي وسريع (Dynamic)" },
  { id: "classic", label: "📐 كلاسيكي (Classic)" },
];

export const TRENDING_AUTOMATION_PICKS = [
  "whippan_left",
  "glitch",
  "hyperzoom",
  "lightleak",
  "whippan_right",
  "filmroll",
  "spinwarp",
  "smoothslide",
];

export function transitionOf(id) {
  return TRANSITIONS[id] || TRANSITIONS.cut;
}

// Assign a transition id to each of `n` cuts, chosen randomly from `picks`,
// avoiding the same id on consecutive cuts when possible. With a single pick,
// every cut gets it. rnd() is injectable for deterministic tests.
export function mixTransitions(picks, n, rnd = Math.random) {
  const out = [];
  if (!picks || !picks.length || n <= 0) return out;
  for (let i = 0; i < n; i++) {
    let pool = picks;
    if (picks.length > 1 && i > 0) pool = picks.filter((p) => p !== out[i - 1]);
    out.push(pool[Math.floor(rnd() * pool.length)]);
  }
  return out;
}

// Convenient helper for applying trending automation mix
export function mixTrendingTransitions(n, rnd = Math.random) {
  return mixTransitions(TRENDING_AUTOMATION_PICKS, n, rnd);
}
