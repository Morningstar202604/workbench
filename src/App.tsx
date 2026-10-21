import { Suspense, useEffect, useState } from "react";
import {
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  RefreshCw,
  Sun,
  X,
} from "lucide-react";
import { useStore } from "./lib/store";
import { useShallow } from "zustand/react/shallow";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./lib/api";
import { APP_VERSION, localeFor, useLang, useT } from "./lib/i18n";
import { BrandBlock, HorizontalNav, VerticalNav } from "./components/Nav";
import { Btn, Modal, Spinner } from "./ui";
import { PAGE_COMPONENTS } from "./pages/registry";
import { useBreakpoint } from "./lib/useBreakpoint";
import { allThemes, findTheme } from "./lib/theme/presets";

/** 当前视图的页面组件。注册表由 pages/registry 统一维护。 */
function CurrentPage({ view }: { view: keyof typeof PAGE_COMPONENTS }) {
  const Page = PAGE_COMPONENTS[view];
  return <Page />;
}

export default function App() {
  const t = useT();
  const lang = useLang();
  const bp = useBreakpoint();
  // 侧边栏折叠（桌面/平板）与抽屉（窄屏）是两套状态：
  // 折叠是用户偏好，抽屉是临时交互，混用一个布尔会在跨断点时表现错乱。
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    view,
    setView,
    theme,
    customThemes,
    setTheme,
    shell,
    refreshMs,
    loadAll,
    refreshRuntime,
    reloadData,
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
      customThemes: s.customThemes,
      setTheme: s.setTheme,
      shell: s.shell,
      refreshMs: s.refreshMs,
      loadAll: s.loadAll,
      refreshRuntime: s.refreshRuntime,
      reloadData: s.reloadData,
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
    // loadAll 内部已经串行触发 refreshRuntime / refreshAi；
    // 依赖保持为空是刻意的（只在挂载时跑一次），因此显式声明稳定引用。
    void loadAll();
  }, [loadAll]);

  // Agent 通过工具修改 data.json 后会广播 event；把磁盘状态拉回内存，
  // 否则用户切到任务/项目页看到的还是旧快照。
  useEffect(() => {
    if (!isTauri()) return;
    // 竞态：listen() 是异步的，若组件在 Promise 落地前就卸载，
    // 直接写 unlisten 会漏解绑，监听器永久泄漏（切换页面反复触发）。
    // 用「已取消」标志在回调里补一次解绑。
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void import("@tauri-apps/api/event")
      .then(({ listen }) => listen("workbench://data-changed", () => void reloadData()))
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [reloadData]);

  useEffect(() => {
    if (!isTauri()) return; // 演示模式没有后端，不建定时器
    // 窗口隐藏（最小化到托盘 / 宿主窗口隐藏）时完全暂停轮询：
    // 一次刷新要做进程快照 + 端口采样，用户看不见界面时继续轮询纯属浪费电。
    // 恢复可见时立即补一次。注意 visibilityState 只在宿主真正隐藏/最小化时
    // 翻转，被其他窗口遮挡不一定触发。
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = setInterval(refreshRuntime, refreshMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
        void refreshRuntime();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
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

  const themes = allThemes(customThemes);
  const current = findTheme(theme, customThemes);
  // 窄屏一律退回侧栏外壳：顶部坞在 390px 下会把导航挤成横滚条，
  // 专注外壳的图标条也没有意义（本来就没有侧边空间）。
  const effectiveShell = bp === "compact" ? "rail" : shell;
  const showRail = effectiveShell !== "dock";
  // 专注外壳把侧栏强制压成图标条；用户自己的折叠偏好仍然保留，
  // 切回其他外壳时恢复原样。
  const railCollapsed = (collapsed || effectiveShell === "zen") && bp !== "compact";
  // 网格强度来自主题数据（不是读 DOM）：主题里 grid=0 时完全不铺网格。
  const showGrid = current.grid > 0;

  const cycleTheme = () => {
    const idx = themes.findIndex((s) => s.id === theme);
    setTheme(themes[(idx + 1) % themes.length].id);
  };

  /** 顶栏右侧的控制簇：三条外壳共用，避免复制三份按钮逻辑。 */
  const controls = (
    <div className="flex items-center gap-2">
      <span className="num hidden text-[11px] text-faint lg:inline">
        {lastRefreshAt
          ? t("app.updatedAt", {
              time: new Date(lastRefreshAt).toLocaleTimeString(localeFor(lang), {
                hour12: false,
              }),
            })
          : t("app.waitingRefresh")}
      </span>
      {loading && <Spinner />}
      <div className="flex items-center gap-0.5 rounded-full border border-line/70 bg-panel2/60 p-0.5">
        <Btn
          title={t("app.refreshNow")}
          onClick={refreshRuntime}
          className="!rounded-full !border-0 !bg-transparent !px-1.5 !py-1 !text-dim hover:!text-text"
        >
          <RefreshCw size={13} />
        </Btn>
        <Btn
          title={alwaysOnTop ? t("app.pinOn") : t("app.pinOff")}
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
          className={`!rounded-full !border-0 !bg-transparent !px-1.5 !py-1 !text-dim hover:!text-text ${
            alwaysOnTop ? "!text-accent" : ""
          }`}
        >
          {alwaysOnTop ? <Pin size={13} /> : <PinOff size={13} />}
        </Btn>
        <Btn
          title={t("app.themeToggle")}
          // 标题栏按钮循环切换主题，具体选择与编辑在设置页
          onClick={cycleTheme}
          className="!rounded-full !border-0 !bg-transparent !px-1.5 !py-1 !text-dim hover:!text-text"
        >
          {current.dark ? <Moon size={13} /> : <Sun size={13} />}
        </Btn>
      </div>
    </div>
  );

  const modeChip = (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-[3px] text-[10px] font-medium tracking-[0.02em] ${
        tauri ? "border-ok/30 bg-ok/8 text-ok" : "border-warn/30 bg-warn/8 text-warn"
      }`}
    >
      <span className={`h-1 w-1 rounded-full ${tauri ? "bg-ok" : "bg-warn"}`} />
      {tauri ? t("app.mode.realtime") : t("app.mode.demo")}
    </span>
  );

  return (
    <div className="flex h-full overflow-hidden bg-bg text-text">
      {/* 窄屏遮罩：抽屉打开时点击关闭 */}
      {bp === "compact" && drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px]"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {showRail && (
        <aside
          className={[
            "z-40 flex shrink-0 flex-col border-r border-line/80 bg-panel/95 transition-[width,transform] duration-200",
            bp === "compact"
              ? `fixed inset-y-0 left-0 w-60 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`
              : railCollapsed
                ? "w-[56px]"
                : "w-[212px]",
          ].join(" ")}
        >
          {/* 品牌：字形直接贴在面板上，没有底板、没有圆角方块、没有阴影片 */}
          <div
            className={`flex h-[52px] items-center border-b border-line/60 ${
              railCollapsed ? "justify-center px-0" : "px-4"
            }`}
          >
            <BrandBlock compact={railCollapsed} />
            {bp === "compact" && (
              <button
                type="button"
                className="ml-auto rounded p-1 text-dim hover:text-text"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("app.close")}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <VerticalNav
            view={view}
            onPick={(k) => {
              setView(k);
              setDrawerOpen(false);
            }}
            collapsed={railCollapsed}
          />

          {/* 折叠开关（仅桌面/平板） */}
          {bp !== "compact" && (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="flex h-9 items-center gap-2 border-t border-line/60 px-3 text-[11px] text-faint transition-colors hover:text-text"
              title={railCollapsed ? t("app.nav.expand") : t("app.nav.collapse")}
            >
              {railCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              {!railCollapsed && (
                <span className="truncate">{t("app.nav.collapse")}</span>
              )}
            </button>
          )}

          <div
            className={`border-t border-line/60 py-2 text-[10px] leading-relaxed text-faint ${
              railCollapsed ? "px-0 text-center" : "px-4"
            }`}
          >
            {!railCollapsed && (
              <>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${tauri ? "bg-ok" : "bg-warn"}`}
                  />
                  {tauri ? t("app.mode.desktop") : t("app.mode.browser")}
                </div>
                <div className="mt-0.5 opacity-70">
                  {t("app.versionLine", { version: APP_VERSION })}
                </div>
              </>
            )}
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {effectiveShell === "dock" ? (
          /* ── 顶部坞：品牌 + 横排导航 + 控制簇全在一行 ── */
          <header
            className="flex h-[52px] shrink-0 items-center gap-4 border-b border-line/80 bg-panel/70 px-4 backdrop-blur-sm"
            data-tauri-drag-region
          >
            <div className="flex shrink-0 items-center gap-2.5 pr-3">
              <BrandBlock compact={false} />
            </div>
            <HorizontalNav view={view} onPick={setView} />
            <div className="ml-auto flex shrink-0 items-center gap-2">{controls}</div>
          </header>
        ) : (
          <header
            className={`flex h-[52px] shrink-0 items-center gap-3 border-b border-line/80 bg-panel/70 backdrop-blur-sm ${
              bp === "compact" ? "px-3" : effectiveShell === "zen" ? "px-6" : "px-6"
            }`}
            data-tauri-drag-region
          >
            {bp === "compact" && (
              <Btn
                title={t("app.nav.menu")}
                onClick={() => setDrawerOpen(true)}
                className="!px-2 !py-1"
              >
                <Menu size={16} />
              </Btn>
            )}
            <h1 className="t-heading truncate text-[15px] font-semibold">
              {t(`app.title.${view}`)}
            </h1>
            {modeChip}
            <div className="ml-auto">{controls}</div>
          </header>
        )}

        <main
          key={view}
          className={`relative flex-1 overflow-auto animate-in ${
            bp === "compact" ? "p-3" : "px-6 py-5"
          }`}
        >
          {/* 底板网格：纯装饰，位于内容之下；强度由主题的 --grid-strength 控制 */}
          {showGrid && (
            <div
              className="grid-field pointer-events-none absolute inset-0"
              style={{ opacity: Math.min(1, current.grid) }}
              aria-hidden="true"
            />
          )}
          <div
            className={`relative mx-auto flex min-h-full flex-col ${
              effectiveShell === "zen" ? "max-w-[1080px]" : "w-full"
            }`}
          >
            <Suspense
              fallback={
                <div className="flex h-64 items-center justify-center gap-3 text-sm text-dim">
                  <Spinner /> {t("app.loading")}
                </div>
              }
            >
              <CurrentPage view={view} />
            </Suspense>
          </div>
        </main>
      </div>

      <Modal
        open={!!killTarget}
        title={t("app.kill.title")}
        onClose={() => setKillTarget(null)}
        footer={
          <>
            <Btn onClick={() => setKillTarget(null)}>{t("app.kill.cancel")}</Btn>
            <Btn
              variant="danger"
              onClick={() => killTarget && killProcess(killTarget.pid)}
            >
              {t("app.kill.confirm", { pid: killTarget?.pid ?? "" })}
            </Btn>
          </>
        }
      >
        <p className="text-sm text-dim">
          {t("app.kill.body", {
            name: killTarget?.name ?? "",
            pid: killTarget?.pid ?? "",
          })}
        </p>
      </Modal>

      {toast && (
        <div
          className="animate-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-panel2/95 px-4 py-1.5 text-[12.5px] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur"
          role="alert"
          aria-live="assertive"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
