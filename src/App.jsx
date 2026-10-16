"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./globals.css";
import { parseTimestampName } from "./lib/timestamp";
import { buildTimeline, trimClips, LEAD_IN } from "./lib/timeline";
import { resolveDimensions, capTo720 } from "./lib/dimensions";
import { getAudioDuration } from "./lib/audio";
import { getWaveformPeaks } from "./lib/waveform";
import { renderVideo, cancelRender, getActiveRender, reconnectRender, probeBackend } from "./lib/serverRender";
import { renderWebCodecs, webCodecsCanRender, pickRenderProfile, startKeepAwake } from "./lib/webcodecsRender";
import { DEFAULT_TRANSITION_DURATION, mixTransitions } from "./lib/transitions";
import { parseTranscript, captionPosPct } from "./lib/captions";
import { makeSfx, serializeSfx } from "./lib/sfx";
import Dropzone from "./components/Dropzone";
import Editor from "./components/Editor";
import ProjectsHome from "./components/ProjectsHome";
import NarrativeWorkspace from "./components/NarrativeWorkspace";
import SeoModal from "./components/SeoModal";
import StorageRing from "./components/StorageRing";
import { DialogHost, showAlert, showPrompt } from "./components/Dialog";
import {
  requestPersist,
  storageEstimate,
  listProjects,
  getProject,
  saveProject,
  renameProject,
  duplicateProject,
  archiveProject,
  deleteProject,
  getMedia,
  syncMedia,
  newId,
  getGlobalSettings,
  saveGlobalSettings,
} from "./lib/projectStore";
import {
  createDefaultGlobalSettings,
  createDefaultNarrativeData,
  computeProjectStatus,
  formatFilenameTimestamp,
} from "./lib/narrativeModel";

function loadImageEl(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { img.url = url; img.fileName = file.name; resolve(img); };
    img.src = url;
  });
}

function loadVideoEl(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const finish = (posterSrc, w, h, dur) => {
      const img = new Image();
      img.onload = () => {
        img.url = posterSrc; img.fileName = file.name;
        img.isVideo = true; img.videoUrl = url; img.videoDuration = dur || 0;
        resolve(img);
      };
      img.onerror = () => {
        img.url = null; img.fileName = file.name; img.isVideo = true;
        img.videoUrl = url; img.videoDuration = dur || 0; resolve(img);
      };
      img.src = posterSrc || url;
    };
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true; v.src = url;
    v.onloadeddata = () => {
      const grab = () => {
        try {
          const c = document.createElement("canvas");
          c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          finish(c.toDataURL("image/jpeg", 0.82), c.width, c.height, v.duration);
        } catch { finish(null, v.videoWidth, v.videoHeight, v.duration); }
      };
      v.onseeked = grab;
      try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch { grab(); }
    };
    v.onerror = () => finish(null, 0, 0, 0);
  });
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

// Create a silent WAV File of a given duration when the user opens the Video Editor
// using manual/authoritative scene timings before uploading a final voiceover file.
function createSilentWavFile(durationSec = 30) {
  const dur = Math.max(2, Math.min(1800, Math.round(durationSec || 30)));
  const sampleRate = 8000;
  const numSamples = dur * sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);
  return new File([buffer], "timeline_guide_track.wav", { type: "audio/wav" });
}

// Create a styled scene placeholder image File when a scene has no uploaded image yet
function createSceneCardFile(scene, width = 1280, height = 720) {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#0b132b");
    grad.addColorStop(0.5, "#1c2541");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(0, 245, 155, 0.35)";
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, width - 80, height - 80);

    ctx.fillStyle = "#00f59b";
    ctx.font = "bold 38px sans-serif";
    ctx.fillText(`SCENE ${scene.sceneNumber}`, 90, 130);

    ctx.fillStyle = "#f3f6fc";
    ctx.font = "600 28px sans-serif";
    const desc = String(scene.visualDescription || scene.mainSubject || "Scene Visual").slice(0, 90);
    ctx.fillText(desc, 90, 200);

    ctx.fillStyle = "#94a3be";
    ctx.font = "22px sans-serif";
    const excerpt = String(scene.scriptExcerpt || "").slice(0, 110);
    ctx.fillText(`"${excerpt}..."`, 90, 265);

    const tsName = `${formatFilenameTimestamp(scene.startTime)}.png`;
    c.toBlob((blob) => {
      resolve(new File([blob || new Blob()], tsName, { type: "image/png" }));
    }, "image/png");
  });
}

function useHistory(initial) {
  const [hist, setHist] = useState({ past: [], present: initial, future: [] });
  const commit = useCallback((updater) => {
    setHist((h) => {
      const next = typeof updater === "function" ? updater(h.present) : updater;
      if (next === h.present) return h;
      return { past: [...h.past, h.present], present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => setHist((h) => {
    if (!h.past.length) return h;
    const prev = h.past[h.past.length - 1];
    return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
  }), []);
  const redo = useCallback(() => setHist((h) => {
    if (!h.future.length) return h;
    const nxt = h.future[0];
    return { past: [...h.past, h.present], present: nxt, future: h.future.slice(1) };
  }), []);
  const reset = useCallback((present) => setHist({ past: [], present, future: [] }), []);
  return [
    hist.present, commit,
    { undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, reset },
  ];
}

export default function Home() {
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [peaks, setPeaks] = useState([]);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_theme") || "dark";
    }
    return "dark";
  });
  const [uiLang, setUiLang] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_ui_lang") || "en";
    }
    return "en";
  });
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("app_theme", theme);
    }
  }, [theme]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("app_ui_lang", uiLang);
    }
  }, [uiLang]);

  const [globalSettings, setGlobalSettings] = useState(() => createDefaultGlobalSettings());
  const [dashboardNav, setDashboardNav] = useState("home"); // "home" | "projects" | "templates" | "settings"
  const [seoModalOpen, setSeoModalOpen] = useState(false);

  const [aspect, setAspect] = useState("16:9");
  const [fps, setFps] = useState(30);
  const [renderQuality, setRenderQuality] = useState("full");
  const [transitionDuration, setTransitionDuration] = useState(DEFAULT_TRANSITION_DURATION);
  const [fadeIn, setFadeIn] = useState(0.5);
  const [fadeOut, setFadeOut] = useState(0.6);
  const [motionByName, setMotionByName] = useState({});
  const [motionAmount, setMotionAmount] = useState(0.08);
  const [trimByName, setTrimByName] = useState({});
  const [volumeByName, setVolumeByName] = useState({});
  const [fitByName, setFitByName] = useState({});
  const [effectByName, setEffectByName] = useState({});
  const [trimEnd, setTrimEnd] = useState(0);
  const [captionRaw, setCaptionRaw] = useState(null);
  const [captionName, setCaptionName] = useState(null);
  const [sfx, setSfx] = useState([]);
  const [sfxUploads, setSfxUploads] = useState([]);
  const [selectedSound, setSelectedSound] = useState(null);
  const [importing, setImporting] = useState(null);
  const [built, setBuilt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outUrl, setOutUrl] = useState(null);
  const [error, setError] = useState(null);
  const [resume, setResume] = useState(null);
  const [view, setView] = useState("list"); // "list" | "editor"
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [narrative, setNarrative] = useState(() => createDefaultNarrativeData());
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });
  const [loadingProject, setLoadingProject] = useState(false);
  const [editorTab, setEditorTab] = useState("captions");
  const saveRef = useRef(null);
  const idRef = useRef(0);
  const nextId = () => `s${idRef.current++}`;

  const updateNarrative = useCallback((updater) => {
    setNarrative((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const [doc, commitDoc, { undo, redo, canUndo, canRedo, reset: resetDoc }] =
    useHistory({
      slots: [],
      transitionsByName: {},
      effectId: "none",
      effectIntensity: 0.5,
      captionStyle: "classic",
      captionColor: "#FFFFFF",
      captionAnimation: "typewriter",
      captionFont: "default",
      captionSize: "md",
      captionPosition: 0,
      captionLineHeight: null,
      captionFontScale: null,
      captionsOn: false,
    });
  const {
    slots = [],
    transitionsByName = {},
    effectId = "none",
    effectIntensity = 0.5,
    captionStyle = "classic",
    captionColor = "#FFFFFF",
    captionAnimation = "typewriter",
    captionFont = "default",
    captionSize = "md",
    captionPosition = 0,
    captionLineHeight = null,
    captionFontScale = null,
    captionsOn = false,
  } = doc;

  const setEffectId = useCallback((id) => {
    commitDoc((d) => ({ ...d, effectId: id }));
  }, [commitDoc]);
  const setEffectIntensity = useCallback((intensity) => {
    commitDoc((d) => ({ ...d, effectIntensity: intensity }));
  }, [commitDoc]);
  const setCaptionStyle = useCallback((style) => {
    commitDoc((d) => ({ ...d, captionStyle: style }));
  }, [commitDoc]);
  const setCaptionColor = useCallback((color) => {
    commitDoc((d) => ({ ...d, captionColor: color }));
  }, [commitDoc]);
  const setCaptionAnimation = useCallback((anim) => {
    commitDoc((d) => ({ ...d, captionAnimation: anim }));
  }, [commitDoc]);
  const setCaptionFont = useCallback((font) => {
    commitDoc((d) => ({ ...d, captionFont: font }));
  }, [commitDoc]);
  const setCaptionSize = useCallback((size) => {
    commitDoc((d) => ({ ...d, captionSize: size }));
  }, [commitDoc]);
  const setCaptionPosition = useCallback((pos) => {
    commitDoc((d) => ({ ...d, captionPosition: pos }));
  }, [commitDoc]);
  const setCaptionLineHeight = useCallback((lh) => {
    commitDoc((d) => ({ ...d, captionLineHeight: lh }));
  }, [commitDoc]);
  const setCaptionFontScale = useCallback((scale) => {
    commitDoc((d) => ({ ...d, captionFontScale: scale }));
  }, [commitDoc]);
  const setCaptionsOn = useCallback((val) => {
    commitDoc((d) => ({ ...d, captionsOn: typeof val === "function" ? val(d.captionsOn) : val }));
  }, [commitDoc]);

  const onAudio = useCallback(async (files) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    try {
      const d = await getAudioDuration(file);
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setAudioDuration(d);
      getWaveformPeaks(file).then(setPeaks);
      setNarrative((prev) => ({
        ...prev,
        actualDurationSec: Math.round(d),
      }));
    } catch (e) { setError(e.message); }
  }, []);

  const addImages = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!files.length) return;
    setImporting({ done: 0, total: files.length });
    try {
      const loaded = await Promise.all(
        files.map(async (f) => {
          const img = f.type.startsWith("video/") ? await loadVideoEl(f) : await loadImageEl(f);
          setImporting((p) => (p ? { ...p, done: p.done + 1 } : p));
          return { file: f, seconds: parseTimestampName(f.name), img };
        })
      );
      commitDoc((d) => {
        const next = d.slots.map((s) => ({ ...s }));
        for (const { file, seconds, img } of loaded) {
          const slot = seconds != null ? next.find((s) => s.seconds === seconds) : null;
          if (slot) {
            slot.file = file; slot.img = img; slot.empty = false;
          } else {
            next.push({ id: nextId(), seconds, file, img, empty: false });
          }
        }
        return { ...d, slots: next };
      });
    } finally {
      setImporting(null);
    }
  }, [commitDoc]);

  const replaceImage = useCallback(async (id, file) => {
    if (!file) return;
    const isVid = file.type.startsWith("video/");
    if (!isVid && !file.type.startsWith("image/")) return;
    const img = isVid ? await loadVideoEl(file) : await loadImageEl(file);
    commitDoc((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.id === id ? { ...s, file, img, empty: false } : s)),
    }));
  }, [commitDoc]);

  const discardImage = useCallback((id) => {
    commitDoc((d) => ({ ...d, slots: d.slots.filter((s) => s.id !== id) }));
  }, [commitDoc]);

  const removeImage = useCallback((id) => {
    commitDoc((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.id === id ? { ...s, file: null, img: null, empty: true } : s)),
    }));
  }, [commitDoc]);

  const fillGap = useCallback(async (name, file) => {
    if (!file) return;
    const isVid = file.type.startsWith("video/");
    if (!isVid && !file.type.startsWith("image/")) return;
    const img = isVid ? await loadVideoEl(file) : await loadImageEl(file);
    commitDoc((d) => {
      if (name === LEAD_IN) {
        return { ...d, slots: [...d.slots, { id: nextId(), seconds: 0, file, img, empty: false }] };
      }
      return { ...d, slots: d.slots.map((s) => (s.id === name ? { ...s, file, img, empty: false } : s)) };
    });
  }, [commitDoc]);

  const resizeBoundary = useCallback((id, seconds) => {
    commitDoc((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.id === id ? { ...s, seconds: +seconds.toFixed(3) } : s)),
    }));
  }, [commitDoc]);

  const onCaptionFile = useCallback(async (file) => {
    if (!file) return;
    const f = file instanceof File ? file : file[0];
    if (!f) return;
    try {
      const text = await f.text();
      setCaptionRaw(text);
      setCaptionName(f.name);
      setCaptionsOn(true);
    } catch (e) { setError(e.message || String(e)); }
  }, [setCaptionsOn]);

  const captionParse = useMemo(
    () => (captionRaw ? parseTranscript(captionRaw, audioDuration) : { cues: [], error: null }),
    [captionRaw, audioDuration]
  );
  const captionCues = captionParse.cues;
  const captionError = captionParse.error;

  useEffect(() => {
    let alive = true;
    (async () => {
      const active = await getActiveRender();
      if (!alive || !active) return;
      setResume({ busy: true, progress: (active.percent || 0) / 100, url: null, error: null });
      try {
        const blob = await reconnectRender(active.jobId, (p) => {
          if (alive) setResume((r) => (r ? { ...r, progress: p } : r));
        });
        if (alive) setResume({ busy: false, progress: 1, url: URL.createObjectURL(blob), error: null });
      } catch (e) {
        if (alive) setResume({ busy: false, progress: 0, url: null, error: e.message || String(e) });
      }
    })();
    return () => { alive = false; };
  }, []);

  const setTransition = useCallback((name, type) => {
    commitDoc((d) => ({ ...d, transitionsByName: { ...d.transitionsByName, [name]: type } }));
  }, [commitDoc]);
  const applyTransitionAll = useCallback((type, clipNames) => {
    commitDoc((d) => {
      const next = {};
      for (let i = 1; i < clipNames.length; i++) next[clipNames[i]] = type;
      return { ...d, transitionsByName: next };
    });
  }, [commitDoc]);

  const setMotion = useCallback((name, type) => {
    setMotionByName((prev) => ({ ...prev, [name]: type }));
  }, []);
  const setTrim = useCallback((name, seconds) => {
    setTrimByName((prev) => ({ ...prev, [name]: Math.max(0, +seconds || 0) }));
  }, []);
  const setVolume = useCallback((name, vol) => {
    setVolumeByName((prev) => ({ ...prev, [name]: Math.min(1, Math.max(0, +vol || 0)) }));
  }, []);
  const setFit = useCallback((name, mode) => {
    setFitByName((prev) => ({ ...prev, [name]: mode }));
  }, []);
  const setClipEffect = useCallback((name, patch) => {
    setEffectByName((prev) => ({ ...prev, [name]: { id: "none", intensity: 0.5, ...(prev[name] || {}), ...patch } }));
  }, []);
  const removeClipEffect = useCallback((name) => {
    setEffectByName((prev) => { const next = { ...prev }; delete next[name]; return next; });
  }, []);

  const addSfx = useCallback((at) => {
    setSelectedSound((sel) => {
      if (sel) setSfx((prev) => [...prev, makeSfx(sel.name, sel.src, at)]);
      return sel;
    });
  }, []);
  const moveSfx = useCallback((id, at) => {
    setSfx((prev) => prev.map((s) => (s.id === id ? { ...s, at: Math.max(0, +at || 0) } : s)));
  }, []);
  const setSfxVolume = useCallback((id, v) => {
    setSfx((prev) => prev.map((s) => (s.id === id ? { ...s, volume: Math.min(1, Math.max(0, +v || 0)) } : s)));
  }, []);
  const removeSfx = useCallback((id) => {
    setSfx((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const uploadSfx = useCallback((file) => {
    if (!file) return;
    const mediaId = `sfx-${newId()}`;
    const url = URL.createObjectURL(file);
    const label = file.name.replace(/\.[^.]+$/, "") || "sound";
    const entry = { mediaId, label, url, _file: file };
    setSfxUploads((prev) => [...prev, entry]);
    setSelectedSound({ name: label, src: { kind: "upload", mediaId }, url });
  }, []);
  const sfxUrlFor = useCallback((src) => {
    if (!src) return null;
    if (src.kind === "lib") return src.file;
    const u = sfxUploads.find((x) => x.mediaId === src.mediaId);
    return u ? u.url : null;
  }, [sfxUploads]);
  const sfxResolved = useMemo(
    () => sfx.map((s) => ({ id: s.id, at: s.at, volume: s.volume, url: sfxUrlFor(s.src) })),
    [sfx, sfxUrlFor]
  );
  const applyMotionAll = useCallback((type, names) => {
    setMotionByName(() => { const next = {}; for (const n of names) next[n] = type; return next; });
  }, []);
  const applyMotionAlternate = useCallback((names) => {
    setMotionByName(() => {
      const next = {};
      names.forEach((n, i) => { next[n] = i % 2 === 0 ? "zoomin" : "zoomout"; });
      return next;
    });
  }, []);
  const applyTransitionMix = useCallback((picks, clipNames) => {
    const cutNames = clipNames.slice(1);
    const assigned = mixTransitions(picks, cutNames.length);
    commitDoc((d) => {
      const next = {};
      cutNames.forEach((name, i) => { next[name] = assigned[i]; });
      return { ...d, transitionsByName: next };
    });
  }, [commitDoc]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const items = useMemo(
    () => slots.map((s) => ({
      name: s.id, seconds: s.seconds, empty: s.empty,
      label: (s.img && s.img.fileName) || (s.file && s.file.name) || s.id,
    })),
    [slots]
  );
  const imagesByName = useMemo(() => {
    const m = {};
    for (const s of slots) if (!s.empty && s.file && !(s.img && s.img.isVideo)) m[s.id] = s.file;
    return m;
  }, [slots]);
  const videosByName = useMemo(() => {
    const m = {};
    for (const s of slots) if (!s.empty && s.file && s.img && s.img.isVideo) m[s.id] = s.file;
    return m;
  }, [slots]);
  const videoInfoByName = useMemo(() => {
    const m = {};
    for (const s of slots) if (!s.empty && s.img && s.img.isVideo) {
      m[s.id] = { url: s.img.videoUrl, duration: s.img.videoDuration || 0 };
    }
    return m;
  }, [slots]);
  const imageEls = useMemo(() => {
    const m = {};
    for (const s of slots) if (!s.empty && s.img) m[s.id] = s.img;
    return m;
  }, [slots]);
  const imageCount = useMemo(() => slots.filter((s) => !s.empty && s.img).length, [slots]);

  const sample = useMemo(() => {
    const imaged = slots
      .filter((s) => !s.empty && s.img && s.seconds != null)
      .sort((a, b) => a.seconds - b.seconds);
    const el = imaged[0] && imaged[0].img;
    return el ? { width: el.naturalWidth, height: el.naturalHeight } : null;
  }, [slots]);

  const dims = useMemo(() => resolveDimensions(aspect, sample), [aspect, sample]);
  const renderDims = useMemo(
    () => (renderQuality === "720p" ? capTo720(dims) : dims),
    [renderQuality, dims]
  );

  useEffect(() => {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        setRenderQuality("720p");
        setFps(24);
      }
    } catch { /* ignore */ }
  }, []);

  const { clips, warnings } = useMemo(
    () => buildTimeline(items, audioDuration),
    [items, audioDuration]
  );

  useEffect(() => { setTrimEnd(audioDuration); }, [audioDuration]);

  const exportDuration = trimEnd > 0 ? Math.min(trimEnd, audioDuration) : audioDuration;

  const ready = audioFile && clips.length > 0;
  const showEditor = built && ready;

  const applyChannelEditorPresets = useCallback((channel) => {
    if (!channel) return;
    if (channel.aspectRatio) {
      setAspect(channel.aspectRatio);
    }
    const ed = channel.editorConfig;
    if (!ed) return;
    if (ed.transitionDuration != null) setTransitionDuration(ed.transitionDuration);
    if (ed.motionAmount != null) setMotionAmount(ed.motionAmount);
    if (ed.fadeIn != null) setFadeIn(ed.fadeIn);
    if (ed.fadeOut != null) setFadeOut(ed.fadeOut);

    commitDoc((d) => {
      const slotIds = (d.slots || []).filter((s) => !s.empty && s.img).map((s) => s.id);
      const nextTransitions = { ...(d.transitionsByName || {}) };
      if (slotIds.length > 1 && ed.transitionType) {
        if (ed.transitionType === "mix") {
          const customPool =
            Array.isArray(ed.transitionMixPool) && ed.transitionMixPool.length
              ? ed.transitionMixPool
              : ["fade", "wipeleft", "wiperight", "slideleft", "circleopen", "zoomin"];
          const assigned = mixTransitions(customPool, slotIds.length - 1);
          slotIds.slice(1).forEach((id, i) => {
            nextTransitions[id] = assigned[i];
          });
        } else {
          slotIds.slice(1).forEach((id) => {
            nextTransitions[id] = ed.transitionType;
          });
        }
      }
      return {
        ...d,
        effectId: ed.effectId || d.effectId || "none",
        effectIntensity: ed.effectIntensity ?? d.effectIntensity ?? 0.5,
        captionsOn: ed.captionsOn ?? d.captionsOn ?? true,
        captionStyle: ed.captionStyle || d.captionStyle || "classic",
        captionFont: ed.captionFont || d.captionFont || "montserrat",
        captionColor: ed.captionColor || d.captionColor || "#FFFFFF",
        captionAnimation: ed.captionAnimation || d.captionAnimation || "pop",
        captionSize: ed.captionSize || d.captionSize || "md",
        captionPosition: ed.captionPosition ?? d.captionPosition ?? 0,
        transitionsByName: nextTransitions,
      };
    });
  }, [commitDoc]);

  // --- Sync Narrative Scenes & Prompts directly into Video Editor Slots ---
  const syncScenesToEditorSlots = useCallback(async () => {
    const channels = globalSettings?.channels || [];
    const activeChannel =
      channels.find((c) => c.id === (narrative.channelId || globalSettings?.defaultChannelId)) ||
      channels[0] ||
      null;

    // 1. Ensure an audio track exists (use uploaded/generated audio or create a guide track matching authoritative duration)
    if (!audioFile) {
      const targetSec = narrative.actualDurationSec || (narrative.config?.targetDurationMinutes || 2) * 60;
      const silentFile = createSilentWavFile(targetSec);
      await onAudio([silentFile]);
    }
    // 2. Apply project aspect ratio from channel or narrative config
    if (activeChannel?.aspectRatio) {
      setAspect(activeChannel.aspectRatio);
    } else if (narrative.config?.aspectRatio) {
      setAspect(narrative.config.aspectRatio);
    }
    // 3. For any scene without an uploaded slot image, generate a clean visual storyboard card so the editor timeline has every scene
    const scenes = narrative.scenes || [];
    const validSlots = slots.filter((s) => !s.empty && s.img);
    if (scenes.length > 0) {
      const missingFiles = [];
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        const expectedSec = Math.floor(sc.startTime || 0);
        const hasSlot =
          validSlots.some(
            (s) =>
              s.seconds != null &&
              (Math.abs(s.seconds - expectedSec) < 0.9 ||
                Math.abs(s.seconds - sc.startTime) < 0.9)
          ) || Boolean(validSlots[i]);
        if (!hasSlot) {
          const cardFile = await createSceneCardFile(sc);
          missingFiles.push(cardFile);
        }
      }
      if (missingFiles.length > 0) {
        await addImages(missingFiles);
      }
    } else if (validSlots.length === 0) {
      // If user jumps directly to Stage 9 Editor before generating scenes, create a starter scene card at 0-00.png
      const starterCard = await createSceneCardFile({
        sceneNumber: 1,
        startTime: 0,
        visualDescription: currentProject?.name || "Scene 1 — Ready for Media",
        scriptExcerpt: narrative.scriptDraft || "Upload or generate scenes to populate the timeline.",
      });
      await addImages([starterCard]);
    }

    // 4. Automatically apply Channel Editor Presets (Filters, Effects, Transitions, Motion, Captions)
    if (activeChannel) {
      applyChannelEditorPresets(activeChannel);
      const ed = activeChannel.editorConfig || {};
      const mode = ed.motionMode || "alternate";
      setTimeout(() => {
        commitDoc((d) => {
          const slotIds = (d.slots || []).filter((s) => !s.empty && s.img).map((s) => s.id);
          if (slotIds.length > 0) {
            const nextMotion = {};
            slotIds.forEach((id, idx) => {
              if (mode === "alternate") nextMotion[id] = idx % 2 === 0 ? "zoomin" : "zoomout";
              else if (mode === "zoomin" || mode === "zoomout") nextMotion[id] = mode;
              else nextMotion[id] = "none";
            });
            setMotionByName(nextMotion);
          }
          const nextTransitions = { ...(d.transitionsByName || {}) };
          if (slotIds.length > 1 && ed.transitionType) {
            if (ed.transitionType === "mix") {
              const customPool =
                Array.isArray(ed.transitionMixPool) && ed.transitionMixPool.length
                  ? ed.transitionMixPool
                  : ["fade", "wipeleft", "wiperight", "slideleft", "circleopen", "zoomin"];
              const assigned = mixTransitions(customPool, slotIds.length - 1);
              slotIds.slice(1).forEach((id, i) => {
                nextTransitions[id] = assigned[i];
              });
            } else {
              slotIds.slice(1).forEach((id) => {
                nextTransitions[id] = ed.transitionType;
              });
            }
          }
          return { ...d, transitionsByName: nextTransitions };
        });
      }, 60);
    }
  }, [audioFile, narrative, onAudio, slots, addImages, currentProject, globalSettings, applyChannelEditorPresets, commitDoc]);

  const handleOpenVideoEditor = useCallback(async () => {
    await syncScenesToEditorSlots();
    setBuilt(true);
    setNarrative((prev) => ({
      ...prev,
      currentStage: 9,
      maxUnlockedStage: Math.max(prev.maxUnlockedStage || 8, 10),
    }));
  }, [syncScenesToEditorSlots]);

  // --- Load projects & global settings on startup ---
  useEffect(() => {
    (async () => {
      try {
        await requestPersist();
        const savedSettings = await getGlobalSettings();
        if (savedSettings) setGlobalSettings(savedSettings);
        setProjects(await listProjects());
        setStorage(await storageEstimate());
      } catch (_) {}
    })();
  }, []);

  const handleSaveGlobalSettings = useCallback(async (newSettings) => {
    setGlobalSettings(newSettings);
    await saveGlobalSettings(newSettings);
  }, []);

  const resetAllState = useCallback(() => {
    let coarse = false;
    try { coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (_) {}
    setAudioFile(null); setAudioUrl(null); setAudioDuration(0); setPeaks([]);
    setAspect(globalSettings?.imageSettings?.aspectRatio || "16:9");
    setFps(coarse ? 24 : 30); setRenderQuality(coarse ? "720p" : "full");
    setTransitionDuration(DEFAULT_TRANSITION_DURATION); setFadeIn(0.5); setFadeOut(0.6);
    setMotionByName({}); setMotionAmount(0.08); setTrimByName({}); setVolumeByName({}); setFitByName({}); setEffectByName({});
    setTrimEnd(0);
    setCaptionRaw(null); setCaptionName(null);
    setSfx([]); setSfxUploads([]); setSelectedSound(null);
    setError(null); setOutUrl(null); setProgress(0);
    idRef.current = 0;
    resetDoc({
      slots: [],
      transitionsByName: {},
      effectId: "none",
      effectIntensity: 0.5,
      captionStyle: "classic",
      captionColor: "#FFFFFF",
      captionAnimation: "typewriter",
      captionFont: "default",
      captionSize: "md",
      captionPosition: 0,
      captionLineHeight: null,
      captionFontScale: null,
      captionsOn: false,
    });
    setNarrative(createDefaultNarrativeData(globalSettings));
    setBuilt(false);
  }, [resetDoc, globalSettings]);

  const newProject = useCallback(() => {
    resetAllState();
    setCurrentProject({ id: newId(), name: "My Awesome Project", createdAt: Date.now() });
    setView("editor");
  }, [resetAllState]);

  const makeThumb = useCallback(() => {
    const s = slots.find((x) => !x.empty && x.img);
    const img = s && s.img;
    if (!img) return narrative?.reference?.thumbnailUrl || null;
    try {
      const iw = img.naturalWidth || img.videoWidth || 320;
      const ih = img.naturalHeight || img.videoHeight || 180;
      const W = 320, H = Math.max(1, Math.round((W * ih) / iw));
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      c.getContext("2d").drawImage(img, 0, 0, W, H);
      return c.toDataURL("image/jpeg", 0.7);
    } catch (_) { return (img.url && String(img.url).startsWith("data:")) ? img.url : (narrative?.reference?.thumbnailUrl || null); }
  }, [slots, narrative]);

  const buildProjectData = useCallback(() => {
    const { progressPct, status } = computeProjectStatus(narrative, built);
    return {
      v: 2,
      narrative: { ...narrative, progressPct, status },
      settings: { aspect, fps, renderQuality, transitionDuration, fadeIn, fadeOut, motionAmount, trimEnd, effectId, effectIntensity },
      maps: { motionByName, trimByName, volumeByName, fitByName, effectByName },
      captions: { captionRaw, captionName, captionsOn, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionFont, captionPosition },
      sfx: serializeSfx(sfx),
      sfxUploads: sfxUploads.map((u) => ({ mediaId: u.mediaId, label: u.label })),
      transitionsByName,
      slots: slots.map((s) => ({
        id: s.id, seconds: s.seconds, empty: !!s.empty,
        fileName: s.file ? s.file.name : (s.img && s.img.fileName) || null,
        isVideo: !!(s.img && s.img.isVideo),
      })),
      audioName: audioFile ? audioFile.name : null,
      idCounter: idRef.current,
      built,
    };
  }, [narrative, aspect, fps, renderQuality, transitionDuration, fadeIn, fadeOut, effectId, effectIntensity, motionAmount, trimEnd,
      motionByName, trimByName, volumeByName, fitByName, effectByName,
      captionRaw, captionName, captionsOn, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale,
      captionFont, captionPosition, sfx, sfxUploads,
      transitionsByName, slots, audioFile, built]);

  const saveCurrent = useCallback(async () => {
    const proj = currentProject;
    if (!proj || loadingProject) return;
    try {
      const { progressPct, status } = computeProjectStatus(narrative, built);
      const rec = {
        id: proj.id,
        name: proj.name,
        createdAt: proj.createdAt || Date.now(),
        thumb: makeThumb(),
        durationSec: exportDuration || narrative.actualDurationSec || (narrative.config?.targetDurationMinutes || 12) * 60,
        clipCount: clips.length || (narrative.scenes?.length || 0),
        niche: narrative.selectedConcept?.niche || narrative.analysis?.niche || "Documentary",
        currentStage: built ? 9 : (narrative.currentStage || 1),
        progressPct,
        status,
        data: buildProjectData(),
      };
      await saveProject(rec);
      const wanted = new Map();
      if (audioFile) wanted.set("audio", audioFile);
      for (const s of slots) if (!s.empty && s.file) wanted.set(s.id, s.file);
      for (const u of sfxUploads) if (u._file) wanted.set(u.mediaId, u._file);
      await syncMedia(proj.id, wanted);
      try { setStorage(await storageEstimate()); } catch (_) {}
    } catch (_) {}
  }, [currentProject, loadingProject, narrative, built, makeThumb, exportDuration, clips.length, buildProjectData, audioFile, slots, sfxUploads]);
  saveRef.current = saveCurrent;

  useEffect(() => {
    if (view !== "editor" || !currentProject || loadingProject) return;
    const t = setTimeout(() => { if (saveRef.current) saveRef.current(); }, 1000);
    return () => clearTimeout(t);
  }, [view, currentProject, loadingProject, narrative, slots, transitionsByName, aspect, fps, renderQuality, transitionDuration,
      fadeIn, fadeOut, effectId, effectIntensity, motionByName, motionAmount, trimByName, volumeByName, fitByName, effectByName, trimEnd,
      captionRaw, captionName, captionsOn, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale,
      captionFont, captionPosition, sfx, sfxUploads,
      audioFile, built]);

  const openProject = useCallback(async (id) => {
    const rec = await getProject(id);
    if (!rec) return;
    const d = rec.data || {};
    resetAllState();
    setCurrentProject({ id: rec.id, name: rec.name, createdAt: rec.createdAt });
    setLoadingProject(true);
    setView("editor");
    try {
      const audioP = (async () => {
        if (!d.audioName) return null;
        const blob = await getMedia(id, "audio");
        if (!blob) return null;
        const file = new File([blob], d.audioName, { type: blob.type || "audio/mpeg" });
        let dur = 0; try { dur = await getAudioDuration(file); } catch (_) {}
        return { file, dur };
      })();
      const slotsP = mapLimit(d.slots || [], 12, async (sm) => {
        if (sm.empty) return { id: sm.id, seconds: sm.seconds, file: null, img: null, empty: true };
        const blob = await getMedia(id, sm.id);
        if (!blob) return { id: sm.id, seconds: sm.seconds, file: null, img: null, empty: true };
        const file = new File([blob], sm.fileName || sm.id, { type: blob.type || (sm.isVideo ? "video/mp4" : "image/png") });
        const img = sm.isVideo ? await loadVideoEl(file) : await loadImageEl(file);
        return { id: sm.id, seconds: sm.seconds, file, img, empty: false };
      });
      const sfxUpP = mapLimit(d.sfxUploads || [], 8, async (u) => {
        const blob = await getMedia(id, u.mediaId);
        if (!blob) return null;
        const file = new File([blob], `${u.label || "sound"}.wav`, { type: blob.type || "audio/wav" });
        return { mediaId: u.mediaId, label: u.label || "sound", url: URL.createObjectURL(file), _file: file };
      });
      const [audio, newSlots, sfxUp] = await Promise.all([audioP, slotsP, sfxUpP]);
      setSfxUploads(sfxUp.filter(Boolean));
      setSfx(d.sfx || []);
      if (audio) {
        setAudioFile(audio.file); setAudioUrl(URL.createObjectURL(audio.file));
        setAudioDuration(audio.dur);
        getWaveformPeaks(audio.file).then(setPeaks).catch(() => {});
      }
      const st = d.settings || {};
      const mp = d.maps || {};
      const cp = d.captions || {};
      resetDoc({
        slots: newSlots,
        transitionsByName: d.transitionsByName || {},
        effectId: st.effectId ?? "none",
        effectIntensity: st.effectIntensity ?? 0.5,
        captionStyle: cp.captionStyle ?? "classic",
        captionColor: cp.captionColor ?? "#FFFFFF",
        captionAnimation: cp.captionAnimation ?? "typewriter",
        captionFont: cp.captionFont ?? "default",
        captionSize: cp.captionSize ?? "md",
        captionPosition: captionPosPct(cp.captionPosition ?? 0),
        captionLineHeight: cp.captionLineHeight ?? null,
        captionFontScale: cp.captionFontScale ?? null,
        captionsOn: !!cp.captionsOn,
      });
      if (d.narrative) {
        setNarrative({
          ...createDefaultNarrativeData(globalSettings),
          ...d.narrative,
        });
      }
      setAspect(st.aspect ?? "16:9"); setFps(st.fps ?? 30); setRenderQuality(st.renderQuality ?? "full");
      setTransitionDuration(st.transitionDuration ?? DEFAULT_TRANSITION_DURATION);
      setFadeIn(st.fadeIn ?? 0.5); setFadeOut(st.fadeOut ?? 0.6);
      setMotionAmount(st.motionAmount ?? 0.08); setTrimEnd(st.trimEnd ?? 0);
      setMotionByName(mp.motionByName || {}); setTrimByName(mp.trimByName || {});
      setVolumeByName(mp.volumeByName || {}); setFitByName(mp.fitByName || {});
      setEffectByName(mp.effectByName || {});
      setCaptionRaw(cp.captionRaw ?? null); setCaptionName(cp.captionName ?? null);
      idRef.current = d.idCounter || newSlots.length;
      setBuilt(!!d.built);
    } finally { setLoadingProject(false); }
  }, [resetDoc, resetAllState, globalSettings]);

  const refreshStorage = useCallback(() => {
    const tick = async () => { try { setStorage(await storageEstimate()); } catch (_) {} };
    tick();
    setTimeout(tick, 500);
    setTimeout(tick, 1500);
    setTimeout(tick, 3000);
  }, []);

  const [savingBack, setSavingBack] = useState(false);
  const backToProjects = useCallback(async () => {
    setSavingBack(true);
    try { if (saveRef.current) await saveRef.current(); } catch (_) {}
    setSavingBack(false);
    setProjects(await listProjects());
    refreshStorage();
    setView("list");
  }, [refreshStorage]);

  const onRenameProject = useCallback(async (id, name) => {
    await renameProject(id, name);
    setCurrentProject((p) => (p && p.id === id ? { ...p, name } : p));
    setProjects(await listProjects());
  }, []);

  const onDuplicateProject = useCallback(async (id) => {
    await duplicateProject(id);
    setProjects(await listProjects());
    refreshStorage();
  }, [refreshStorage]);

  const onArchiveProject = useCallback(async (id, archived) => {
    await archiveProject(id, archived);
    setProjects(await listProjects());
  }, []);

  const onDeleteProject = useCallback(async (id) => {
    await deleteProject(id);
    setProjects(await listProjects());
    refreshStorage();
  }, [refreshStorage]);

  const renameCurrent = useCallback(async (directName, isInline = false) => {
    if (!currentProject) return;
    if (isInline && typeof directName === "string") {
      const trimmed = directName.trim();
      setCurrentProject((p) => (p ? { ...p, name: directName } : p));
      if (trimmed) {
        onRenameProject(currentProject.id, trimmed);
      }
      return;
    }
    const name = await showPrompt("Rename project", {
      title: "Rename project", defaultValue: currentProject.name || "Untitled project", okText: "Rename",
    });
    if (name && name.trim()) onRenameProject(currentProject.id, name.trim());
  }, [currentProject, onRenameProject]);

  const cancelRef = useRef(false);
  const onCancel = useCallback(() => {
    cancelRef.current = true;
    cancelRender();
    setBusy(false);
    setProgress(0);
  }, []);
  const wcCancelRef = useRef(false);
  const onWebCodecsCancel = useCallback(() => { wcCancelRef.current = true; }, []);

  const onRender = useCallback(async () => {
    cancelRef.current = false;
    setBusy(true); setError(null); setOutUrl(null); setProgress(0);
    try {
      const exportClips = trimClips(clips, exportDuration);
      const transitions = exportClips.map((c) => transitionsByName[c.name] || "cut");
      const motions = exportClips.map((c) => motionByName[c.name] || "none");
      const modeOf = (c) => {
        const info = videoInfoByName[c.name];
        if (!info) return "fit";
        return fitByName[c.name] || ((info.duration || 0) > (c.duration || 0) ? "trim" : "fit");
      };
      const trims = exportClips.map((c) =>
        (videoInfoByName[c.name] && modeOf(c) === "trim") ? (trimByName[c.name] || 0) : 0);
      const speeds = exportClips.map((c) => {
        const info = videoInfoByName[c.name];
        if (!info) return 1;
        const dur = info.duration || 0, slot = c.duration || 0;
        return (modeOf(c) === "fit" && slot > 0 && dur > 0 && Math.abs(dur - slot) > 0.05) ? +(dur / slot).toFixed(4) : 1;
      });
      const volumes = exportClips.map((c) =>
        Object.prototype.hasOwnProperty.call(videosByName, c.name)
          ? (volumeByName[c.name] == null ? 0.5 : volumeByName[c.name]) : 0);
      const captions = captionsOn && captionCues.length ? captionCues : null;
      const blob = await renderVideo({
        clips: exportClips, imagesByName, videosByName, audioFile,
        width: renderDims.width, height: renderDims.height, fps,
        transitions, transitionDuration, motions, motionAmount, trims, volumes, speeds, fadeIn, fadeOut, effectId, effectIntensity, effectByName,
        captions, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionFont, captionPosition,
        onProgress: setProgress,
      });
      setOutUrl(URL.createObjectURL(blob));
    } catch (e) {
      if (!cancelRef.current) setError(e.message || String(e));
    } finally {
      if (!cancelRef.current) setBusy(false);
    }
  }, [clips, exportDuration, imagesByName, videosByName, audioFile, renderDims, fps, transitionsByName, transitionDuration,
      motionByName, motionAmount, trimByName, volumeByName, fitByName, videoInfoByName, fadeIn, fadeOut, effectId, effectIntensity, effectByName,
      captionsOn, captionCues, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionFont, captionPosition]);

  const [wcBusy, setWcBusy] = useState(false);
  const [wcProgress, setWcProgress] = useState(0);
  const [wcPhase, setWcPhase] = useState("Rendering");
  const [doneMsg, setDoneMsg] = useState(null);
  const doneTimerRef = useRef(0);
  const flashDone = useCallback((msg) => {
    setDoneMsg(msg);
    clearTimeout(doneTimerRef.current);
    doneTimerRef.current = setTimeout(() => setDoneMsg(null), 6000);
  }, []);
  const [wcOk, setWcOk] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [wcEnabled, setWcEnabled] = useState(true);
  const [wcProfile, setWcProfile] = useState(null);
  const [renderChecked, setRenderChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [wc, srv] = await Promise.all([
        webCodecsCanRender().catch(() => false),
        probeBackend().catch(() => false),
      ]);
      if (!alive) return;
      setWcOk(wc); setServerAvailable(srv); setRenderChecked(true);
    })();
    return () => { alive = false; };
  }, []);
  const cantRender = renderChecked && !wcOk && !serverAvailable;
  useEffect(() => {
    let alive = true;
    if (!wcOk) { setWcProfile(null); return; }
    pickRenderProfile(renderDims.width, renderDims.height, fps, 8_000_000)
      .then((p) => { if (alive) setWcProfile(p); }).catch(() => { if (alive) setWcProfile(null); });
    return () => { alive = false; };
  }, [wcOk, renderDims.width, renderDims.height, fps]);

  const onWebCodecsTest = useCallback(async () => {
    wcCancelRef.current = false;
    const logs = [];
    const profile = wcProfile;
    if (!profile) {
      showAlert("This browser can't encode video. Use Chrome, Edge, or Safari 16.4+.", { title: "Fast render unavailable" });
      return;
    }
    const fileName = `${((currentProject && currentProject.name) || "autoeditor").replace(/[^\w.-]+/g, "_") || "autoeditor"}.mp4`;
    const writable = null;
    setWcBusy(true); setWcProgress(0); setWcPhase("Rendering");
    const stopKeepAwake = startKeepAwake();
    try {
      const exportClips = trimClips(clips, exportDuration);
      const transitions = exportClips.map((c) => transitionsByName[c.name] || "cut");
      const motions = exportClips.map((c) => motionByName[c.name] || "none");
      const modeOf = (c) => {
        const info = videoInfoByName[c.name];
        if (!info) return "fit";
        return fitByName[c.name] || ((info.duration || 0) > (c.duration || 0) ? "trim" : "fit");
      };
      const trims = exportClips.map((c) =>
        (videoInfoByName[c.name] && modeOf(c) === "trim") ? (trimByName[c.name] || 0) : 0);
      const speeds = exportClips.map((c) => {
        const info = videoInfoByName[c.name];
        if (!info) return 1;
        const dur = info.duration || 0, slot = c.duration || 0;
        return (modeOf(c) === "fit" && slot > 0 && dur > 0 && Math.abs(dur - slot) > 0.05) ? +(dur / slot).toFixed(4) : 1;
      });
      const volumes = exportClips.map((c) =>
        Object.prototype.hasOwnProperty.call(videosByName, c.name)
          ? (volumeByName[c.name] == null ? 0.5 : volumeByName[c.name]) : 0);
      const bitrate = 8_000_000;
      const blob = await renderWebCodecs(
        {
          clips: exportClips, width: renderDims.width, height: renderDims.height, fps, bitrate, profile,
          transitions, transitionDuration, motions, motionAmount, audioFile,
          videosByName, trims, speeds, volumes,
          cues: captionsOn && captionCues.length ? captionCues : null,
          captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionFont, captionPosition,
          effectId, effectIntensity, effectByName,
          sfx: sfxResolved,
        },
        imagesByName,
        (frac, phase) => { setWcProgress(frac); if (phase) setWcPhase(phase); },
        () => wcCancelRef.current,
        logs,
        writable,
      );
      const audioIssue = logs.find((l) => /audio failed|produced no audio/i.test(l));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        flashDone(audioIssue ? `Downloaded “${fileName}” — no audio` : `Downloaded “${fileName}”`);
      } else {
        flashDone(audioIssue ? `Saved “${fileName}” — no audio` : `Saved to “${fileName}”`);
      }
      if (audioIssue) {
        showAlert("Your video was created, but the audio couldn’t be added, so the file has no sound.",
          { title: "Video saved without audio", details: `${audioIssue}\n\nThis usually means an unusual audio format. Try re-exporting the voiceover as a standard 48 kHz WAV or MP3 and render again.` });
      }
    } catch (e) {
      if (writable) { try { await writable.abort(); } catch (_) {} }
      if (!(e && e.cancelled)) {
        const details = [
          `Error: ${e && e.message ? e.message : String(e)}`,
          "",
          "— render log —",
          ...logs,
          "",
          "— environment —",
          `resolution: ${renderDims.width}x${renderDims.height} @ ${fps}fps`,
          `userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
          e && e.stack ? `\nstack:\n${e.stack}` : "",
        ].join("\n");
        showAlert("The Fast render failed. Copy the details below if you want to report it.",
          { title: "Fast render failed", details });
      }
    } finally {
      stopKeepAwake();
      setWcBusy(false);
      setWcProgress(0);
      setWcPhase("Rendering");
    }
  }, [clips, exportDuration, transitionsByName, motionByName, imagesByName, renderDims, fps, transitionDuration, motionAmount, effectId, effectIntensity, effectByName, sfxResolved, audioFile,
      videosByName, videoInfoByName, fitByName, trimByName, volumeByName, currentProject, flashDone, wcProfile,
      captionsOn, captionCues, captionStyle, captionColor, captionAnimation, captionSize, captionLineHeight, captionFontScale, captionFont, captionPosition]);

  const [loadingSample, setLoadingSample] = useState(false);
  const loadSampleDemo = useCallback(async () => {
    try {
      setLoadingSample(true);
      setError(null);
      const audioRes = await fetch("/sample-test/voiceover.wav");
      if (!audioRes.ok) throw new Error("Could not load sample voiceover");
      const audioBlob = await audioRes.blob();
      const audioFileObj = new File([audioBlob], "voiceover.wav", { type: "audio/wav" });
      await onAudio([audioFileObj]);

      const sampleNames = [
        "0-00.png", "0-03.png", "0-07.png", "0-12.png", "0-16.png",
        "0-20.png", "0-24.png", "0-28.png", "0-31.png", "0-34.png"
      ];
      const imageFiles = [];
      for (const name of sampleNames) {
        const res = await fetch(`/sample-test/${name}`);
        if (res.ok) {
          const b = await res.blob();
          imageFiles.push(new File([b], name, { type: "image/png" }));
        }
      }
      if (imageFiles.length) {
        await addImages(imageFiles);
      }
      const sampleCaptions = `1\n00:00:00,500 --> 00:00:03,000\nThe Lost City of Atlantis — Narrative Production\n\n2\n00:00:03,100 --> 00:00:06,800\nAutomated timeline synced to voiceover\n\n3\n00:00:07,000 --> 00:00:11,500\nVibrant animated captions with custom styling\n\n4\n00:00:12,000 --> 00:00:15,800\nKinetic transitions and atmosphere effects\n\n5\n00:00:16,000 --> 00:00:20,000\nHigh-speed WebCodecs MP4 rendering`;
      setCaptionRaw(sampleCaptions);
      setCaptionName("demo_captions.srt");
      setCaptionsOn(true);
      setCaptionColor("#00F0FF");
      setCaptionAnimation("pop");

      // Also populate sample narrative stages so user can inspect all stages or jump to editor
      setCurrentProject((p) => p ? { ...p, name: "The Lost City of Atlantis" } : p);
      setNarrative((prev) => ({
        ...prev,
        currentStage: 8,
        maxUnlockedStage: 10,
        status: "Ready for Editing",
        selectedConcept: {
          id: "sample_c1",
          title: "The Lost City of Atlantis — What Ancient Records Actually Reveal",
          premise: "An investigative documentary exploring archaeological discoveries and Plato's original texts.",
          niche: "History / Documentary",
          subNiche: "Ancient Mysteries",
          targetAudience: "Curious documentary viewers",
          mainHook: "You've probably heard of Atlantis... but what if the real story was hidden in plain sight?",
          storyStructure: "Origin myth -> Geological evidence -> Modern underwater discoveries",
          narrationStyle: "Documentary",
          visualDirection: "Cinematic underwater ruins and ancient maps",
          viewerAppeal: "High curiosity gap",
          differentiation: "Evidence-first narrative",
          payoff: "How real sunken cities shaped the legend",
        },
        approvedScript:
          "You've probably heard of Atlantis, but what if it was inspired by a real catastrophe? For centuries, this lost city has captured the imagination of explorers, historians, and scientists. In this video, we explore the ancient records, geological theories, and underwater discoveries that reveal the truth behind the legend.",
        scriptDraft:
          "You've probably heard of Atlantis, but what if it was inspired by a real catastrophe? For centuries, this lost city has captured the imagination of explorers, historians, and scientists. In this video, we explore the ancient records, geological theories, and underwater discoveries that reveal the truth behind the legend.",
        actualDurationSec: 37,
        audioConfirmed: true,
        scenesConfirmed: true,
        scenes: [
          { id: "sc1", sceneNumber: 1, startTime: 0, endTime: 3, duration: 3, scriptExcerpt: "You've probably heard of Atlantis...", visualDescription: "Vast underwater city ruins with glowing columns", mainSubject: "Sunken ruins", environment: "Deep ocean", emotionalTone: "Mysterious", cameraFraming: "wide shot", transitionSuggestion: "fade" },
          { id: "sc2", sceneNumber: 2, startTime: 3, endTime: 7, duration: 4, scriptExcerpt: "For centuries, this lost city has captured imagination...", visualDescription: "Ancient parchment scroll and bronze compass", mainSubject: "Ancient map", environment: "Archive", emotionalTone: "Curious", cameraFraming: "close-up", transitionSuggestion: "fade" },
          { id: "sc3", sceneNumber: 3, startTime: 7, endTime: 12, duration: 5, scriptExcerpt: "Explorers and scientists searched the Mediterranean...", visualDescription: "Research vessel scanning the ocean floor with sonar", mainSubject: "Expedition ship", environment: "Open sea", emotionalTone: "Investigative", cameraFraming: "aerial shot", transitionSuggestion: "wipeleft" },
        ],
      }));
    } catch (err) {
      setError("Failed to load demo: " + (err.message || err));
    } finally {
      setLoadingSample(false);
    }
  }, [onAudio, addImages, setCaptionsOn, setCaptionColor, setCaptionAnimation]);

  if (cantRender) {
    return (
      <main className="unsupported">
        <div className="unsupported__card">
          <img className="unsupported__logo" src="/logo.svg" width="52" height="52" alt="" />
          <h1 className="unsupported__h">Open in Chrome, Edge, or Safari</h1>
          <p className="unsupported__p">
            <span className="unsupported__brand">Universal YouTube Narrative Studio</span> exports video using your
            browser’s built-in video encoder — which this browser doesn’t have.
          </p>
          <p className="unsupported__p">
            Please open this site in <b>Google Chrome</b>, <b>Microsoft Edge</b>, or <b>Safari 16.4+</b>
            {" "}to create and export your videos. (Firefox isn’t supported.)
          </p>
        </div>
      </main>
    );
  }

  if (view === "list") {
    return (
      <>
        <DialogHost />
        <ProjectsHome
          projects={projects}
          onNew={newProject}
          onOpen={openProject}
          onRename={onRenameProject}
          onDuplicate={onDuplicateProject}
          onArchive={onArchiveProject}
          onDelete={onDeleteProject}
          storage={storage}
          theme={theme}
          setTheme={setTheme}
          uiLang={uiLang}
          setUiLang={setUiLang}
          globalSettings={globalSettings}
          onSaveGlobalSettings={handleSaveGlobalSettings}
          activeNav={dashboardNav}
          setActiveNav={setDashboardNav}
        />
      </>
    );
  }

  return (
    <>
      <DialogHost />
      <SeoModal
        open={seoModalOpen}
        onClose={() => setSeoModalOpen(false)}
        projectName={currentProject?.name || "Untitled Project"}
        onSelectFinalTitle={(title) => renameCurrent(title, true)}
        narrative={narrative}
        globalSettings={globalSettings}
        onUpdateSeo={(seoPkg) =>
          updateNarrative((prev) => ({
            ...prev,
            seoPackage: seoPkg,
            outdated: { ...prev.outdated, seo: false },
          }))
        }
        uiLang={uiLang}
      />

      {doneMsg && (
        <div className="donetoast" role="status" aria-live="polite" onClick={() => setDoneMsg(null)}>
          <span className="donetoast__ok" aria-hidden="true">✓</span>
          <span>Render complete — {doneMsg}</span>
        </div>
      )}
      {savingBack && (
        <div className="importing" role="status" aria-live="polite">
          <span className="importing__spin" aria-hidden="true" />
          Saving project…
        </div>
      )}
      {importing && (
        <div className="importing" role="status" aria-live="polite">
          <span className="importing__spin" aria-hidden="true" />
          Loading media… {importing.done} / {importing.total}
        </div>
      )}

      {loadingProject ? (
        <div className="projload">
          <span className="projload__spin" aria-hidden="true" />
          <span className="projload__txt">Loading project…</span>
        </div>
      ) : (
        <NarrativeWorkspace
          currentProject={currentProject}
          onRenameProject={renameCurrent}
          narrative={narrative}
          updateNarrative={updateNarrative}
          globalSettings={globalSettings}
          onSaveGlobalSettings={handleSaveGlobalSettings}
          applyChannelEditorPresets={applyChannelEditorPresets}
          backToProjects={backToProjects}
          openSettingsFromWorkspace={() => {
            setDashboardNav("settings");
            backToProjects();
          }}
          openChannelsFromWorkspace={() => {
            setDashboardNav("channels");
            backToProjects();
          }}
          audioFile={audioFile}
          audioUrl={audioUrl}
          audioDuration={audioDuration}
          onAudio={onAudio}
          slots={slots}
          addImages={addImages}
          replaceImage={replaceImage}
          removeImage={removeImage}
          syncScenesToEditorSlots={syncScenesToEditorSlots}
          captionRaw={captionRaw}
          captionName={captionName}
          captionCues={captionCues}
          captionError={captionError}
          onCaptionFile={onCaptionFile}
          onUpdateCaptionRaw={setCaptionRaw}
          onOpenVideoEditor={handleOpenVideoEditor}
          onOpenSeoModal={() => setSeoModalOpen(true)}
          loadSampleDemo={loadSampleDemo}
          loadingSample={loadingSample}
          theme={theme}
          setTheme={setTheme}
          uiLang={uiLang}
          setUiLang={setUiLang}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onQuickExport={() => setEditorTab("export")}
          editorNode={
            <Editor
              clips={clips} imageEls={imageEls} audioUrl={audioUrl}
              duration={audioDuration} peaks={peaks} dims={dims}
              aspect={aspect} setAspect={setAspect} fps={fps} setFps={setFps}
              renderQuality={renderQuality} setRenderQuality={setRenderQuality} renderDims={renderDims}
              onWebCodecsTest={onWebCodecsTest} onWebCodecsCancel={onWebCodecsCancel}
              wcBusy={wcBusy} wcProgress={wcProgress} wcPhase={wcPhase} wcAvailable={wcOk} serverAvailable={serverAvailable}
              wcEnabled={wcEnabled} setWcEnabled={setWcEnabled}
              onRender={onRender} onCancel={onCancel} busy={busy} progress={progress}
              outUrl={outUrl} error={error} warnings={warnings}
              replaceImage={replaceImage} removeImage={removeImage} fillGap={fillGap}
              resizeBoundary={resizeBoundary}
              transitionsByName={transitionsByName} transitionDuration={transitionDuration}
              setTransition={setTransition} applyTransitionAll={applyTransitionAll}
              applyTransitionMix={applyTransitionMix}
              setTransitionDuration={setTransitionDuration}
              fadeIn={fadeIn} setFadeIn={setFadeIn}
              effectId={effectId} setEffectId={setEffectId}
              effectIntensity={effectIntensity} setEffectIntensity={setEffectIntensity}
              fadeOut={fadeOut} setFadeOut={setFadeOut}
              motionByName={motionByName} setMotion={setMotion}
              effectByName={effectByName} setClipEffect={setClipEffect} removeClipEffect={removeClipEffect}
              sfx={sfx} sfxResolved={sfxResolved} sfxUploads={sfxUploads}
              selectedSound={selectedSound} setSelectedSound={setSelectedSound}
              addSfx={addSfx} moveSfx={moveSfx} setSfxVolume={setSfxVolume} removeSfx={removeSfx} uploadSfx={uploadSfx}
              applyMotionAll={applyMotionAll} applyMotionAlternate={applyMotionAlternate}
              motionAmount={motionAmount} setMotionAmount={setMotionAmount}
              videoInfoByName={videoInfoByName}
              trimByName={trimByName} setTrim={setTrim}
              volumeByName={volumeByName} setVolume={setVolume}
              fitByName={fitByName} setFit={setFit}
              trimEnd={exportDuration} setTrimEnd={setTrimEnd} exportDuration={exportDuration}
              undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo}
              captionCues={captionCues} captionsOn={captionsOn} setCaptionsOn={setCaptionsOn}
              captionStyle={captionStyle} setCaptionStyle={setCaptionStyle}
              captionColor={captionColor} setCaptionColor={setCaptionColor}
              captionAnimation={captionAnimation} setCaptionAnimation={setCaptionAnimation}
              captionSize={captionSize} setCaptionSize={setCaptionSize}
              captionLineHeight={captionLineHeight} setCaptionLineHeight={setCaptionLineHeight}
              captionFontScale={captionFontScale} setCaptionFontScale={setCaptionFontScale}
              captionFont={captionFont} setCaptionFont={setCaptionFont}
              captionPosition={captionPosition} setCaptionPosition={setCaptionPosition}
              captionName={captionName} captionError={captionError} onCaptionFile={onCaptionFile}
              activeTab={editorTab} onTabChange={setEditorTab}
            />
          }
        />
      )}
    </>
  );
}
