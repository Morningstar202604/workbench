import { chartThemeFor, type StyleId } from "./themes";

/**
 * 把风格应用到 DOM。
 *
 * 只写 `data-theme` 一个属性：所有颜色、圆角、阴影、字体都通过 CSS 变量
 * 从该属性派生，避免 JS 到处写内联样式。
 * 同时把图表需要的明暗信息写成 `data-chart-theme`，供 ECharts 读取。
 */
export function applyTheme(id: StyleId): void {
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.chartTheme = chartThemeFor(id);
  const isDark = chartThemeFor(id) === "dark";
  root.style.colorScheme = isDark ? "dark" : "light";
}
