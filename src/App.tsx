import { Suspense, useEffect } from "react";
import { Moon, Pin, PinOff, RefreshCw, Sun } from "lucide-react";
import { useStore } from "./lib/store";
import { useShallow } from "zustand/react/shallow";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./lib/api";
import { APP_VERSION, localeFor, useLang, useT } from "./lib/i18n";
import logoUrl from "./assets/logo.png";
import { Btn, Modal, Spinner } from "./ui";
import { PAGE_COMPONENTS, PAGES } from "./pages/registry";

/** 当前视图的页面组件。注册表由 pages/registry 统一维护。 */
function CurrentPage({ view }: { view: keyof typeof PAGE_COMPONENTS }) {
  const Page = PAGE_COMPONENTS[view];
  return <Page />;
}

export default function App() {
  const t = useT();
  const lang = useLang();
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
    // loadAll 内部已经串行触发 refreshRuntime / refreshAi；
    // 依赖保持为空是刻意的（只在挂载时跑一次），因此显式声明稳定引用。
    void loadAll();
  }, [loadAll]);

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
      <aside className="flex w-48 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 px-4 py-4">
          <img
            src={logoUrl}
            alt="Workbench logo"
            className="h-8 w-8 rounded-lg"
            draggable={false}
          />
          <div>
            <div className="text-sm font-bold leading-tight">{t("app.brand")}</div>
            <div className="text-[10px] leading-tight text-dim">{t("app.brandSub")}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {PAGES.map(({ key, icon: Icon }) => {
            return (
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
                {t(`app.nav.${key}`)}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto px-3 py-3 text-[10px] leading-relaxed text-dim">
          <div>{tauri ? t("app.mode.desktop") : t("app.mode.browser")}</div>
          <div className="mt-0.5 opacity-60">
            {t("app.versionLine", { version: APP_VERSION })}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel/80 px-5 backdrop-blur"
          data-tauri-drag-region
        >
          <h1 className="text-base font-semibold">{t(`app.title.${view}`)}</h1>
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${tauri ? "text-ok border-ok/40 bg-ok/10" : "text-warn border-warn/40 bg-warn/10"}`}
          >
            {tauri ? t("app.mode.realtime") : t("app.mode.demo")}
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-dim">
            {loading && <Spinner />}
            <span>
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
