"use client";
import { useState, useMemo } from "react";
import { showConfirm, showPrompt } from "./Dialog";
import StorageRing from "./StorageRing";
import SettingsView from "./SettingsView";
import ChannelsView from "./ChannelsView";
import { WORKFLOW_STAGES } from "../lib/narrativeModel";
import {
  Home,
  FolderPlus,
  Folders,
  Layers,
  Settings,
  Search,
  MoreVertical,
  Play,
  Copy,
  Archive,
  Trash2,
  Edit3,
  Sun,
  Moon,
  Globe,
  Sparkles,
  Film,
  Tv,
} from "lucide-react";

function timeAgo(ts, isAr = false) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return isAr ? "الآن" : "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return isAr ? `منذ ${m} د` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isAr ? `منذ ${h} س` : `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return isAr ? `منذ ${d} يوم` : `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}

function formatMinLabel(sec) {
  if (!sec || !Number.isFinite(sec)) return "8 min";
  const m = Math.max(1, Math.round(sec / 60));
  return `${m} min`;
}

export default function ProjectsHome({
  projects = [],
  onNew,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
  storage,
  theme,
  setTheme,
  uiLang = "en",
  setUiLang,
  globalSettings,
  onSaveGlobalSettings,
  activeNav = "home",
  setActiveNav,
}) {
  const isAr = uiLang === "ar";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [menuId, setMenuId] = useState(null);

  const doRename = async (p) => {
    setMenuId(null);
    const name = await showPrompt(isAr ? "إعادة تسمية المشروع" : "Rename project", {
      title: isAr ? "إعادة تسمية المشروع" : "Rename project",
      defaultValue: p.name || "Untitled project",
      okText: isAr ? "حفظ" : "Rename",
    });
    if (name && name.trim()) onRename(p.id, name.trim());
  };

  const doDuplicate = async (p) => {
    setMenuId(null);
    if (onDuplicate) await onDuplicate(p.id);
  };

  const doArchive = async (p) => {
    setMenuId(null);
    if (onArchive) await onArchive(p.id, !p.archived);
  };

  const doDelete = async (p) => {
    setMenuId(null);
    const ok = await showConfirm(
      isAr
        ? `هل أنت متأكد من حذف "${p.name || "Untitled"}"؟ سيتم حذف المشروع وجميع ملفاته نهائياً.`
        : `Delete "${p.name || "Untitled"}"? This permanently removes the project and its media from this device.`,
      { title: isAr ? "حذف المشروع" : "Delete project", okText: isAr ? "حذف" : "Delete", danger: true }
    );
    if (ok) onDelete(p.id);
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter === "ARCHIVED") {
        if (!p.archived) return false;
      } else {
        if (p.archived) return false;
        if (statusFilter !== "ALL" && (p.status || "Draft") !== statusFilter) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (p.name || "").toLowerCase().includes(q);
        const matchNiche = (p.niche || "").toLowerCase().includes(q);
        return matchName || matchNiche;
      }
      return true;
    });
  }, [projects, search, statusFilter]);

  const stageLabelFor = (stageNum) => {
    const st = WORKFLOW_STAGES.find((s) => s.id === (stageNum || 1)) || WORKFLOW_STAGES[0];
    return isAr ? st.labelAr : st.labelEn;
  };

  return (
    <div
      className="uyns-shell"
      dir={isAr ? "rtl" : "ltr"}
      onClick={() => menuId && setMenuId(null)}
    >
      {/* Left Studio Sidebar */}
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
          <button
            type="button"
            onClick={() => setActiveNav && setActiveNav("home")}
            className={`uyns-nav-item ${activeNav === "home" ? "is-active" : ""}`}
          >
            <Home className="w-4 h-4" />
            <span>{isAr ? "الرئيسية" : "Home"}</span>
          </button>

          <button
            type="button"
            onClick={onNew}
            className="uyns-nav-item"
          >
            <FolderPlus className="w-4 h-4" />
            <span>{isAr ? "مشروع جديد" : "New Project"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav && setActiveNav("projects")}
            className={`uyns-nav-item ${activeNav === "projects" ? "is-active" : ""}`}
          >
            <Folders className="w-4 h-4" />
            <span>{isAr ? "مشاريعي" : "My Projects"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav && setActiveNav("channels")}
            className={`uyns-nav-item ${activeNav === "channels" ? "is-active" : ""}`}
          >
            <Tv className="w-4 h-4 text-[var(--accent)]" />
            <span>{isAr ? "القنوات والستايلات" : "Channels & Styles"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav && setActiveNav("templates")}
            className={`uyns-nav-item ${activeNav === "templates" ? "is-active" : ""}`}
          >
            <Layers className="w-4 h-4" />
            <span>{isAr ? "القوالب والأنماط" : "Templates"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav && setActiveNav("settings")}
            className={`uyns-nav-item ${activeNav === "settings" ? "is-active" : ""}`}
          >
            <Settings className="w-4 h-4" />
            <span>{isAr ? "الإعدادات" : "Settings"}</span>
          </button>
        </nav>

        <div className="uyns-sidebar__footer">
          <StorageRing storage={storage} />
          <span className="text-[11px] text-[var(--muted)]">
            {isAr ? "حفظ تلقائي محلي" : "Persistent IndexedDB"}
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="uyns-main">
        {/* Top Header */}
        <header className="uyns-topbar">
          <div className="uyns-topbar__search">
            <Search className="w-4 h-4 text-[var(--muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "ابحث في مشاريعك..." : "Search your projects..."}
            />
          </div>

          <div className="uyns-topbar__actions">
            {setTheme && (
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="uyns-top-pill"
                title={isAr ? "تغيير المظهر" : "Toggle Theme"}
              >
                {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                <span>{theme === "dark" ? (isAr ? "نهاري" : "Light") : isAr ? "ليلي" : "Dark"}</span>
              </button>
            )}

            {setUiLang && (
              <button
                type="button"
                onClick={() => setUiLang(uiLang === "en" ? "ar" : "en")}
                className="uyns-top-pill"
                title="Switch Language / تغيير اللغة"
              >
                <Globe className="w-4 h-4 text-[var(--cyan)]" />
                <span>{uiLang === "en" ? "EN ▾" : "عربي ▾"}</span>
              </button>
            )}

            <div className="uyns-user-badge">
              <div className="uyns-user-avatar">YP</div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold leading-tight">Yassine</span>
                <span className="text-[10px] text-[var(--muted)] leading-tight">Creator Studio</span>
              </div>
            </div>
          </div>
        </header>

        {/* Body Content */}
        <div className="uyns-content-scroll">
          {activeNav === "channels" ? (
            <ChannelsView
              settings={globalSettings}
              onSaveSettings={onSaveGlobalSettings}
              uiLang={uiLang}
            />
          ) : activeNav === "settings" || activeNav === "templates" ? (
            <SettingsView
              settings={globalSettings}
              onSaveSettings={onSaveGlobalSettings}
              theme={theme}
              setTheme={setTheme}
              uiLang={uiLang}
              setUiLang={setUiLang}
            />
          ) : (
            <div className="space-y-6">
              {/* Hero Welcome Banner */}
              {activeNav === "home" && (
                <section className="uyns-hero-banner">
                  <div className="uyns-hero-banner__content">
                    <h1 className="uyns-hero-banner__title">
                      {isAr ? "مرحباً بك مجدداً، ياسين! 👋" : "Welcome back, Yassine! 👋"}
                    </h1>
                    <p className="uyns-hero-banner__sub">
                      {isAr
                        ? "اصنع فيديوهات يوتيوب احترافية بالذكاء الاصطناعي. حوّل المراجع والأفكار إلى إنتاج متكامل."
                        : "Create amazing YouTube videos with AI. Turn reference ideas into complete narrative productions."}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-4">
                      <button type="button" className="uyns-btn uyns-btn--primary" onClick={onNew}>
                        <Sparkles className="w-4 h-4" />
                        <span>{isAr ? "＋ مشروع جديد" : "＋ New Project"}</span>
                      </button>
                      <button
                        type="button"
                        className="uyns-btn uyns-btn--ghost"
                        onClick={() => setActiveNav && setActiveNav("settings")}
                      >
                        <Settings className="w-4 h-4" />
                        <span>{isAr ? "قوالب الإنتاج" : "Production Presets"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="uyns-hero-banner__visual" aria-hidden="true">
                    <div className="uyns-hero-graphic">
                      <div className="uyns-hero-graphic__screen">
                        <Film className="w-8 h-8 text-[var(--accent)]" />
                        <div className="uyns-hero-graphic__bars">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Projects List Section */}
              <section className="uyns-projects-section">
                <div className="uyns-projects-header">
                  <h2 className="uyns-projects-title">
                    {isAr ? "مشاريعك المحفوظة" : "Your Projects"}
                  </h2>

                  <div className="uyns-projects-filters">
                    <div className="uyns-filter-search">
                      <Search className="w-3.5 h-3.5 text-[var(--muted)]" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={isAr ? "بحث في المشاريع..." : "Search projects..."}
                      />
                    </div>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="uyns-filter-select"
                    >
                      <option value="ALL">{isAr ? "كل الحالات" : "All Status"}</option>
                      <option value="Draft">{isAr ? "مسودة (Draft)" : "Draft"}</option>
                      <option value="In Progress">{isAr ? "قيد العمل (In Progress)" : "In Progress"}</option>
                      <option value="Ready for Editing">
                        {isAr ? "جاهز للمونتاج (Ready for Editing)" : "Ready for Editing"}
                      </option>
                      <option value="Completed">{isAr ? "مكتمل (Completed)" : "Completed"}</option>
                      <option value="ARCHIVED">{isAr ? "المؤرشفة (Archived)" : "Archived"}</option>
                    </select>
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="uyns-empty-projects">
                    <Film className="w-10 h-10 text-[var(--muted)] mx-auto mb-3 opacity-70" />
                    <h3 className="text-base font-bold mb-1">
                      {isAr ? "لا توجد مشاريع مطابقة" : "No projects found"}
                    </h3>
                    <p className="text-xs text-[var(--muted)] max-w-md mx-auto mb-4">
                      {isAr
                        ? "ابدأ مشروعاً جديداً بتحليل فيديو مرجعي على يوتيوب وتوليد 5 أفكار أصلية وسيناريو كامل."
                        : "Start a new project from a YouTube reference URL or create a custom narrative production."}
                    </p>
                    <button type="button" className="uyns-btn uyns-btn--primary" onClick={onNew}>
                      <span>{isAr ? "＋ إنشاء أول مشروع" : "＋ Create New Project"}</span>
                    </button>
                  </div>
                ) : (
                  <div className="uyns-project-rows">
                    {filteredProjects.map((p) => {
                      const status = p.status || "Draft";
                      const pct = p.progressPct || 10;
                      const stageName = stageLabelFor(p.currentStage || 1);
                      return (
                        <div
                          key={p.id}
                          className="uyns-project-row"
                          onClick={() => onOpen(p.id)}
                        >
                          <div className="uyns-project-row__thumb">
                            {p.thumb ? (
                              <img
                                src={p.thumb}
                                alt={p.name || "Project thumbnail"}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="uyns-project-row__placeholder">
                                <Film className="w-6 h-6 text-[var(--muted)]" />
                              </div>
                            )}
                          </div>

                          <div className="uyns-project-row__info">
                            <h3 className="uyns-project-row__title">
                              {p.name || "Untitled Project"}
                            </h3>
                            <div className="uyns-project-row__meta">
                              <span>{p.niche || "Documentary"}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{formatMinLabel(p.durationSec)}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {isAr ? "المرحلة:" : "Stage:"} {stageName}
                              </span>
                            </div>
                          </div>

                          <div className="uyns-project-row__progress">
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="font-semibold text-[var(--text)]">{status}</span>
                              <span className="text-[var(--muted)] font-mono">
                                {pct}% · {timeAgo(p.updatedAt, isAr)}
                              </span>
                            </div>
                            <div className="uyns-progress-track">
                              <div
                                className="uyns-progress-fill"
                                style={{ width: `${Math.min(100, Math.max(8, pct))}%` }}
                              />
                            </div>
                          </div>

                          <div
                            className="uyns-project-row__actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className={`uyns-btn ${
                                status === "In Progress" ? "uyns-btn--primary" : "uyns-btn--ghost"
                              } uyns-btn--sm`}
                              onClick={() => onOpen(p.id)}
                            >
                              <span>
                                {status === "In Progress"
                                  ? isAr
                                    ? "متابعة"
                                  : "Continue"
                                  : isAr
                                  ? "فتح ↗"
                                  : "Open ↗"}
                              </span>
                            </button>

                            <div className="relative">
                              <button
                                type="button"
                                className="uyns-icon-btn"
                                onClick={() => setMenuId(menuId === p.id ? null : p.id)}
                                aria-label="Project menu"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              {menuId === p.id && (
                                <div className="uyns-dropdown-menu">
                                  <button type="button" onClick={() => doRename(p)}>
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>{isAr ? "إعادة تسمية" : "Rename"}</span>
                                  </button>
                                  <button type="button" onClick={() => doDuplicate(p)}>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>{isAr ? "نسخ المشروع" : "Duplicate"}</span>
                                  </button>
                                  <button type="button" onClick={() => doArchive(p)}>
                                    <Archive className="w-3.5 h-3.5" />
                                    <span>
                                      {p.archived
                                        ? isAr
                                          ? "إلغاء الأرشفة"
                                          : "Unarchive"
                                        : isAr
                                        ? "أرشفة"
                                        : "Archive"}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[var(--bad)]"
                                    onClick={() => doDelete(p)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>{isAr ? "حذف" : "Delete"}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
