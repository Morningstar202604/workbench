/**
 * 界面缩放。
 *
 * 为什么不用「改根字号」：全站有 151 处 `text-[11px]` 这类写死的 pt 尺寸，
 * 改根字号只会影响那几处用 rem 的地方，视觉上是「部分文字变大」，比不缩放更糟。
 * 缩放必须作用在整棵渲染树上：
 * - 桌面端用 WebView 自己的 zoom（`webview.setZoom`），它按设备像素比缩放，
 *   文字、图标、图表 canvas 一起变，且不触发重排逻辑；
 * - 浏览器预览没有该 API，退回 CSS `zoom`（Chromium/WebView2 都支持）。
 *
 * 缩放值存在主题里（`textScale`）：同一套配色在 4K 屏与 1080p 笔记本上
 * 本来就应该有不同的字号，把它当主题的一部分比当全局设置更符合直觉。
 */

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let applied = 1;

/** 应用缩放（幂等；值未变时不触碰 DOM）。 */
export function applyUiScale(scale: number): void {
  const next = Number.isFinite(scale) ? Math.max(0.85, Math.min(1.2, scale)) : 1;
  if (Math.abs(next - applied) < 0.001) return;
  applied = next;

  if (inTauri()) {
    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(next))
      .catch(() => {
        // 缩放失败不影响可用性：界面保持 100%，不弹错误
      });
    return;
  }
  if (typeof document !== "undefined") {
    document.documentElement.style.zoom = String(next);
  }
}

/** 测试用：重置内部缓存，让同一进程内的多次挂载都真正应用一次。 */
export function resetAppliedScaleForTests(): void {
  applied = 1;
}
