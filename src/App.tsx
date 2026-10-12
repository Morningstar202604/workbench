import { lazy, memo, Suspense, useEffect } from "react";
import {
  Cpu,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Moon,
  Pin,
  PinOff,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
} from "lucide-react";
import { useStore } from "./lib/store";
import { useShallow } from "zustand/react/shallow";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./lib/api";
import logoUrl from "./assets/logo.png";
import { Btn, Modal, Spinner } from "./ui";
import type { ViewKey } from "./types";

// ── 按需加载所有页面 ──────────────────────────────────────
// memo：App 自己订阅的字段（loading / toast / lastRefreshAt…）变化时，
// 页面组件自身订阅的切片若没变就不该跟着重渲染 —— 否则任何一次 store 更新
// 都会把整棵页面树重建一次（进程页 400 行时实测单次约 225ms）。
const Overview = memo(lazy(() => import("./pages/Overview")));
const Processes = memo(lazy(() => import("./pages/Processes")));
const Servers = memo(lazy(() => import("./pages/Servers")));
const AiSessions = memo(lazy(() => import("./pages/AiSessions")));
const Projects = memo(lazy(() => import("./pages/Projects")));
const Tasks = memo(lazy(() => import("./pages/Tasks")));
const Settings = memo(lazy(() => import("./pages/Settings")));
const Logs = memo(lazy(() => import("./pages/Logs")));

const NAV: { key: ViewKey; label: string; icon: typeof Cpu }[] = [
  { key: "overview", label: "概览", icon: LayoutDashboard },
  { key: "processes", label: "进程", icon: Cpu },
  { key: "servers", label: "服务与端口", icon: Server },
  { key: "ai", label: "AI 会话", icon: Sparkles },
  { key: "projects", label: "项目", icon: FolderKanban },
  { key: "tasks", label: "任务", icon: ListChecks },
  { key: "settings", label: "设置", icon: SettingsIcon },
  { key: "logs", label: "运行日志", icon: FileText },
];

const TITLES: Record<ViewKey, string> = {
  overview: "概览",
  processes: "进程监控",
  servers: "服务与端口",
  ai: "AI 会话",
  projects: "项目管理",
  tasks: "任务看板",
  settings: "设置",
  logs: "运行日志",
};

export default function App() {
  const {
    view,
    setView,
    theme,
    setTheme,
    refreshMs,
    loadAll,
    refreshRuntime,
    loading,
    lastRefreshAt,
    killTarget,
    setKillTarget,
    killProcess,
    toast,
    clearToast,
    alwaysOnTop,
    setAlwaysOnTop,
  } = useStore(
    useShallow((s) => ({
      view: s.view,
      setView: s.setView,
      theme: s.theme,
      setTheme: s.setTheme,
      refreshMs: s.refreshMs,
      loadAll: s.loadAll,
      refreshRuntime: s.refreshRuntime,
      loading: s.loading,
      lastRefreshAt: s.lastRefreshAt,
      killTarget: s.killTarget,
      setKillTarget: s.setKillTarget,
      killProcess: s.killProcess,
      toast: s.toast,
      clearToast: s.clearToast,
      alwaysOnTop: s.alwaysOnTop,
      setAlwaysOnTop: s.setAlwaysOnTop,
    }))
  );

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTauri()) return; // 演示模式没有后端，不建定时器
    const id = setInterval(refreshRuntime, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, refreshRuntime]);

  const tauri = isTauri();

  // ESC 键关闭 Toast
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && toast) clearToast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast, clearToast]);

  return (
    <div className="flex h-full overflow-hidden bg-bg text-text">
      <aside className="flex w-48 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src={logoUrl} alt="工作台 Logo" className="h-8 w-8 rounded-lg" draggable={false} />
          <div>
            <div className="text-sm font-bold leading-tight">工作台</div>
            <div className="text-[10px] leading-tight text-dim">Workbench</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                view === key
                  ? "bg-accentsoft font-semibold text-accent"
                  : "text-dim hover:bg-panel2 hover:text-text"
              }`}
            >
              {view === key && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
              )}
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-3 py-3 text-[10px] leading-relaxed text-dim">
          <div>{tauri ? "桌面模式 · 数据存本机" : "浏览器预览 · 演示数据"}</div>
          <div className="mt-0.5 opacity-60">v0.1.0 · Tauri 2</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel/80 px-5 backdrop-blur"
          data-tauri-drag-region
        >
          <h1 className="text-base font-semibold">{TITLES[view]}</h1>
          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${tauri ? "text-ok border-ok/40 bg-ok/10" : "text-warn border-warn/40 bg-warn/10"}`}>
            {tauri ? "实时" : "演示"}
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-dim">
            {loading && <Spinner />}
            <span>
              {lastRefreshAt
                ? `更新于 ${new Date(lastRefreshAt).toLocaleTimeString("zh-CN", { hour12: false })}`
                : "等待刷新"}
            </span>
            <Btn title="立即刷新" onClick={refreshRuntime} className="!px-2 !py-1">
              <RefreshCw size={14} />
            </Btn>
            <Btn
              title={alwaysOnTop ? "取消窗口置顶" : "窗口置顶"}
              onClick={async () => {
                const next = !alwaysOnTop;
                setAlwaysOnTop(next);
                if (isTauri()) {
                  try {
                    await invoke("set_always_on_top", { on: next });
                  } catch {
                    setAlwaysOnTop(!next);
                  }
                }
              }}
              className={`!px-2 !py-1 ${alwaysOnTop ? "!text-accent" : ""}`}
            >
              {alwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
            </Btn>
            <Btn
              title="切换主题"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="!px-2 !py-1"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </Btn>
          </div>
        </header>

        <main key={view} className="flex-1 overflow-auto p-5 animate-in">
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center gap-3 text-sm text-dim">
                <Spinner /> 加载中…
              </div>
            }
          >
            {view === "overview" && <Overview />}
            {view === "processes" && <Processes />}
            {view === "servers" && <Servers />}
            {view === "ai" && <AiSessions />}
            {view === "projects" && <Projects />}
            {view === "tasks" && <Tasks />}
            {view === "settings" && <Settings />}
            {view === "logs" && <Logs />}
          </Suspense>
        </main>
      </div>

      <Modal
        open={!!killTarget}
        title="结束进程（不可恢复）"
        onClose={() => setKillTarget(null)}
        footer={
          <>
            <Btn onClick={() => setKillTarget(null)}>取消</Btn>
            <Btn variant="danger" onClick={() => killTarget && killProcess(killTarget.pid)}>
              确认结束 {killTarget?.pid}
            </Btn>
          </>
        }
      >
        <p className="text-sm text-dim">
          确定要结束进程 <span className="font-mono text-text">{killTarget?.name}</span>（PID{" "}
          {killTarget?.pid}）吗？未保存的数据可能丢失，此操作不可恢复。
        </p>
      </Modal>

      {toast && (
        <div
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-line bg-panel px-4 py-2 text-sm shadow-xl"
          role="alert"
          aria-live="assertive"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
