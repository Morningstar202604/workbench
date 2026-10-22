import { Suspense, useState } from "react";
import { useStore } from "./lib/store";
import { useShallow } from "zustand/react/shallow";
import { useT } from "./lib/i18n";
import { AppHeader, DockHeader } from "./components/AppHeader";
import { KillDialog, Toast } from "./components/KillDialog";
import { Sidebar } from "./components/Nav";
import { Spinner } from "./ui";
import { PAGE_COMPONENTS } from "./pages/registry";
import { useBreakpoint } from "./lib/useBreakpoint";
import { useAppRuntime } from "./lib/useAppRuntime";
import { findTheme } from "./lib/theme/presets";
import { shellLayout } from "./lib/useShellLayout";

/** 当前视图的页面组件。注册表由 pages/registry 统一维护。 */
function CurrentPage({ view }: { view: keyof typeof PAGE_COMPONENTS }) {
  const Page = PAGE_COMPONENTS[view];
  return <Page />;
}

export default function App() {
  const t = useT();
  const bp = useBreakpoint();
  // 侧边栏折叠（桌面/平板）与抽屉（窄屏）是两套状态：
  // 折叠是用户偏好，抽屉是临时交互，混用一个布尔会在跨断点时表现错乱。
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { view, setView, shell } = useStore(
    useShallow((s) => ({
      view: s.view,
      setView: s.setView,
      shell: s.shell,
    }))
  );

  useAppRuntime();

  const layout = shellLayout(bp, shell, collapsed);
  // 网格强度来自主题数据（不是读 DOM）：主题里 grid=0 时完全不铺网格。
  const gridStrength = useStore(
    useShallow((s) => findTheme(s.theme, s.customThemes).grid)
  );
  const showGrid = gridStrength > 0;

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

      {layout.showRail && (
        <Sidebar
          collapsed={layout.railCollapsed}
          compact={bp === "compact"}
          drawerOpen={drawerOpen}
          view={view}
          onPick={(k) => {
            setView(k);
            setDrawerOpen(false);
          }}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          onCloseDrawer={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {layout.dock ? (
          <DockHeader view={view} onPick={setView} />
        ) : (
          <AppHeader
            compact={bp === "compact"}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
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
              style={{ opacity: Math.min(1, gridStrength) }}
              aria-hidden="true"
            />
          )}
          <div
            className={`relative mx-auto flex min-h-full flex-col ${
              layout.narrowContent ? "max-w-[1080px]" : "w-full"
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

      <KillDialog />
      <Toast />
    </div>
  );
}
