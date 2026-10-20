import { useEffect, useState } from "react";

/**
 * 响应式断点。与 Tailwind 默认断点对齐，避免 CSS 与 JS 判断不一致。
 *
 * 场景覆盖：
 * - `compact`（< 768）：手机 / 窄窗，侧边栏变成抽屉，表格折叠为卡片
 * - `medium`（768–1279）：平板 / 半屏，侧边栏可折叠为图标条
 * - `wide`（≥ 1280）：桌面全宽，侧边栏完整展开
 */
export type Breakpoint = "compact" | "medium" | "wide";

const QUERIES: { key: Breakpoint; query: string }[] = [
  { key: "compact", query: "(max-width: 767px)" },
  { key: "medium", query: "(min-width: 768px) and (max-width: 1279px)" },
  { key: "wide", query: "(min-width: 1280px)" },
];

function readBreakpoint(): Breakpoint {
  if (typeof window === "undefined" || !window.matchMedia) return "wide";
  for (const { key, query } of QUERIES) {
    if (window.matchMedia(query).matches) return key;
  }
  return "wide";
}

/**
 * 订阅当前断点。用 matchMedia 的 change 事件而不是 resize：
 * 只在跨越断点时才触发重渲染，拖拽窗口不会每帧 setState。
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(readBreakpoint);

  useEffect(() => {
    if (!window.matchMedia) return;
    const lists = QUERIES.map(({ query }) => window.matchMedia(query));
    const onChange = () => setBp(readBreakpoint());
    for (const l of lists) l.addEventListener("change", onChange);
    // 挂载后校准一次：初始渲染可能与真实视口不一致（SSR/预渲染）
    onChange();
    return () => {
      for (const l of lists) l.removeEventListener("change", onChange);
    };
  }, []);

  return bp;
}

/** 便捷判断 */
export function useIsCompact(): boolean {
  return useBreakpoint() === "compact";
}
