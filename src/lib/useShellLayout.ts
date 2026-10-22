import type { ShellId } from "./layout";
import type { Breakpoint } from "./useBreakpoint";

/**
 * 外壳布局决策：把「当前该用哪种骨架」的布尔推导集中在一处。
 *
 * 从 App.tsx 抽出来的原因：App 的圈复杂度实测 43（红线 10），其中一大半
 * 是这类「窄屏回退 / 专注压缩 / 是否显示侧栏 / 是否铺网格」的内联三元。
 * 抽成纯函数后既能单测，也让 App 只剩组装。
 */
export interface ShellLayout {
  /** 生效的外壳（窄屏强制回退侧栏） */
  effective: ShellId;
  /** 是否渲染侧栏（顶部坞不渲染） */
  showRail: boolean;
  /** 侧栏是否压成图标条 */
  railCollapsed: boolean;
  /** 顶部坞变体（只在非窄屏且选了 dock 时） */
  dock: boolean;
  /** 内容单列居中（专注外壳） */
  narrowContent: boolean;
}

export function shellLayout(
  bp: Breakpoint,
  shell: ShellId,
  collapsed: boolean
): ShellLayout {
  const compact = bp === "compact";
  // 窄屏一律回退侧栏：顶部坞在 390px 下会把导航挤成横滚条，
  // 专注外壳的图标条也没有意义（本来就没有侧边空间）。
  const effective: ShellId = compact ? "rail" : shell;
  return {
    effective,
    showRail: effective !== "dock",
    railCollapsed: (collapsed || effective === "zen") && !compact,
    dock: effective === "dock",
    narrowContent: effective === "zen",
  };
}
