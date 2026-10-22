import { useEffect } from "react";
import { isTauri } from "./api";
import { useStore } from "./store";

/**
 * 应用级副作用：首屏加载、Agent 改数据后的回灌、可见性驱动的轮询、ESC 关 toast。
 *
 * 从 App.tsx 抽出来的原因：App 的圈复杂度实测 18（红线 10），而这几段
 * 全是与渲染无关的订阅逻辑。抽走后 App 只剩「外壳 + 路由」。
 */
export function useAppRuntime() {
  const loadAll = useStore((s) => s.loadAll);
  const reloadData = useStore((s) => s.reloadData);
  const refreshRuntime = useStore((s) => s.refreshRuntime);
  const refreshMs = useStore((s) => s.refreshMs);
  const toast = useStore((s) => s.toast);
  const clearToast = useStore((s) => s.clearToast);

  // 首屏：loadAll 内部已串行触发 refreshRuntime / refreshAi
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Agent 通过工具改了 data.json 会广播事件；把磁盘状态拉回内存
  useEffect(() => {
    if (!isTauri()) return;
    return subscribeDataChanged(() => void reloadData());
  }, [reloadData]);

  // 轮询：窗口隐藏时暂停（看不见界面时继续采样纯属浪费电）
  useEffect(() => {
    if (!isTauri()) return;
    return pollWhileVisible(refreshRuntime, refreshMs);
  }, [refreshMs, refreshRuntime]);

  // ESC 关闭 toast
  useEffect(() => {
    if (!toast) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearToast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast, clearToast]);
}

/**
 * 订阅后端的数据变更广播。返回解绑函数。
 *
 * 竞态：listen() 是异步的，若组件在 Promise 落地前卸载，直接写 unlisten
 * 会漏解绑 → 监听器永久泄漏（切换页面反复触发）。用「已取消」标志补一次解绑。
 */
function subscribeDataChanged(onChange: () => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | null = null;
  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen("workbench://data-changed", onChange))
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
}

/** 可见时轮询、隐藏时停表；恢复可见立即补一次。 */
function pollWhileVisible(tick: () => void, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const start = () => {
    stop();
    timer = setInterval(tick, intervalMs);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      start();
      tick();
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
}
