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
import logoUrl from "./assets/logo.png";
import { Btn, Modal, Spinner } from "./ui";
import { PAGE_COMPONENTS, PAGE_GROUPS, pagesByGroup } from "./pages/registry";
import { useBreakpoint } from "./lib/useBreakpoint";
import { STYLES, styleOf } from "./lib/theme/themes";
import type { ViewKey } from "./pages/registry";

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
    setTheme,
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
      setTheme: s.setTheme,
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

      <aside
        className={[
          "z-40 flex shrink-0 flex-col border-r border-line bg-panel transition-[width,transform] duration-200",
          // 窄屏：变成从左侧滑出的抽屉，默认收起
          bp === "compact"
            ? `fixed inset-y-0 left-0 w-60 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`
            : collapsed
              ? "w-14"
              : "w-52",
        ].join(" ")}
      >
        <div
          className={`flex items-center gap-2 px-3 py-4 ${collapsed && bp !== "compact" ? "justify-center" : ""}`}
        >
          <img
            src={logoUrl}
            alt="Workbench logo"
            className="h-8 w-8 shrink-0 rounded-lg"
            draggable={false}
          />
          {(!collapsed || bp === "compact") && (
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight">
                {t("app.brand")}
              </div>
              <div className="truncate text-[10px] leading-tight text-dim">
                {t("app.brandSub")}
              </div>
            </div>
          )}
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

        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {pagesByGroup().map(({ group, pages }) => {
            // 折叠态也要显示所有页面：只显示当前组会让「设置/日志」没有入口，
            // 用户必须先展开才能切过去。折叠时用一条分隔线代表分组边界。
            const showItems = true;
            const showGroupLabel = !collapsed || bp === "compact";
            return (
              <div key={group} className="mb-1">
                {showGroupLabel ? (
                  <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-dim/70">
                    {t(PAGE_GROUPS.find((g) => g.key === group)?.label ?? group)}
                  </div>
                ) : (
                  // 折叠时用分隔线代替组标题；第一个组不画，避免顶部多余线条
                  group !== "monitor" && (
                    <div
                      className="mx-2 my-1.5 border-t border-line/60"
                      aria-hidden="true"
                    />
                  )
                )}
                {showItems &&
                  pages.map(({ key, icon: Icon }) => {
                    const active = view === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={t(`app.nav.${key}`)}
                        onClick={() => {
                          setView(key as ViewKey);
                          setDrawerOpen(false);
                        }}
                        className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? "bg-accentsoft font-semibold text-accent"
                            : "text-dim hover:bg-panel2 hover:text-text"
                        } ${collapsed && bp !== "compact" ? "justify-center px-0" : ""}`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                        )}
                        <Icon size={16} className="shrink-0" />
                        {(!collapsed || bp === "compact") && (
                          <span className="truncate">{t(`app.nav.${key}`)}</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </nav>

        {/* 折叠开关（仅桌面/平板） */}
        {bp !== "compact" && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-dim hover:text-text"
            title={collapsed ? t("app.nav.expand") : t("app.nav.collapse")}
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            {!collapsed && <span className="truncate">{t("app.nav.collapse")}</span>}
          </button>
        )}

        <div className="px-3 py-2 text-[10px] leading-relaxed text-dim">
          {(!collapsed || bp === "compact") && (
            <>
              <div>{tauri ? t("app.mode.desktop") : t("app.mode.browser")}</div>
              <div className="mt-0.5 opacity-60">
                {t("app.versionLine", { version: APP_VERSION })}
              </div>
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel/80 backdrop-blur ${
            bp === "compact" ? "px-3" : "px-5"
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
          <h1 className="truncate text-base font-semibold">{t(`app.title.${view}`)}</h1>
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${tauri ? "text-ok border-ok/40 bg-ok/10" : "text-warn border-warn/40 bg-warn/10"}`}
          >
            {tauri ? t("app.mode.realtime") : t("app.mode.demo")}
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-dim">
            {loading && <Spinner />}
            <span className="hidden sm:inline">
              {lastRefreshAt
                ? t("app.updatedAt", {
                    time: new Date(lastRefreshAt).toLocaleTimeString(localeFor(lang), {
                      hour12: false,
                    }),
                  })
                : t("app.waitingRefresh")}
            </span>
            <Btn
              title={t("app.refreshNow")}
              onClick={refreshRuntime}
              className="!px-2 !py-1"
            >
              <RefreshCw size={14} />
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
              className={`!px-2 !py-1 ${alwaysOnTop ? "!text-accent" : ""}`}
            >
              {alwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
            </Btn>
            <Btn
              title={t("app.themeToggle")}
              // 标题栏按钮循环切换风格，具体选择在设置页（带预览）
              onClick={() => {
                const idx = STYLES.findIndex((s) => s.id === theme);
                setTheme(STYLES[(idx + 1) % STYLES.length].id);
              }}
              className="!px-2 !py-1"
            >
              {styleOf(theme).dark ? <Moon size={14} /> : <Sun size={14} />}
            </Btn>
          </div>
        </header>

        <main
          key={view}
          className={`flex-1 overflow-auto animate-in ${bp === "compact" ? "p-3" : "p-5"}`}
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
