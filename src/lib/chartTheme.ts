/**
 * 图表配色取值（与 lib/echarts.tsx 的主题注册保持同一份色板）。
 *
 * 为什么单独成文件：这些是纯函数，却被 `EChart` 组件所在的模块导出，
 * 会让 Vite 的 Fast Refresh 无法只刷新组件（react-refresh 规则会告警）。
 * 拆开后组件模块只导出组件，热更新语义干净。
 *
 * 为什么必须显式传 theme 而不是读 DOM：ECharts 不解析 CSS 变量，选项里
 * 必须给真实色值；而页面里图表选项是 useMemo 缓存的，若隐式读
 * document.documentElement.dataset.theme，切换主题时 memo 不重算，
 * 图表会残留旧主题的配色。显式传参让这个依赖进入 deps，可被静态检查。
 */
export type ThemeName = "dark" | "light";

interface ChartTheme {
  bg: string;
  panel: string;
  line: string;
  text: string;
  dim: string;
  accent: string;
  accentSoft: string;
  ok: string;
  warn: string;
  danger: string;
}

export const DARK: ChartTheme = {
  bg: "#0a0f1c",
  panel: "#121a2b",
  line: "#22304a",
  text: "#e6edf7",
  dim: "#8b98ad",
  accent: "#22d3ee",
  accentSoft: "#16323d",
  ok: "#34d399",
  warn: "#fbbf24",
  danger: "#f87171",
};

export const LIGHT: ChartTheme = {
  bg: "#eef2f8",
  panel: "#ffffff",
  line: "#d8e1ee",
  text: "#17233a",
  dim: "#5d6c85",
  accent: "#0e7490",
  accentSoft: "#d9f1f7",
  ok: "#047857",
  warn: "#b45309",
  danger: "#dc2626",
};

export function chartTheme(theme: ThemeName): ChartTheme {
  return theme === "light" ? LIGHT : DARK;
}

/**
 * 图表中「环形图扇区之间的间隙」应使用的颜色 —— 即面板背景色。
 * 不传参时回退读 DOM，供无法拿到 theme 的场景（如测试）使用。
 */
export function chartGapColor(theme?: ThemeName): string {
  if (theme) return chartTheme(theme).bg;
  if (typeof document === "undefined") return DARK.bg;
  return document.documentElement.dataset.theme === "light" ? LIGHT.bg : DARK.bg;
}

/** 当前主题下的分隔线颜色（用于空数据占位图元）。 */
export function chartLineColor(theme?: ThemeName): string {
  if (theme) return chartTheme(theme).line;
  if (typeof document === "undefined") return DARK.line;
  return document.documentElement.dataset.theme === "light" ? LIGHT.line : DARK.line;
}

// ── 通用图表选项构造器 ─────────────────────────────────────
//
// 原先 4 个页面各自手写一遍「横向条形图」配置，结构完全一致、只有颜色与
// 字号不同。抽成构造器后差异集中在参数里，改一处即可全局生效。

export interface HorizontalBarOptions {
  /** 类目轴标签 */
  labels: string[];
  /** 数值；每项可单独指定颜色（两端渐隐），不指定则用默认青色渐变 */
  values: { value: number; color?: string }[];
  /** 主题，决定无自定义颜色时的默认渐变 */
  theme: ThemeName;
  /** 左侧留白，标签越长需要越大 */
  left?: number;
  /** 类目轴字号 */
  fontSize?: number;
  /** 是否反转类目顺序（自上而下递增） */
  inverse?: boolean;
  /** 条宽 */
  barWidth?: number;
  /** 数值标签格式化 */
  valueLabel?: string;
}

/** 构造横向条形图配置（类目在 Y 轴、数值在 X 轴、隐藏 X 轴）。 */
export function horizontalBarOption({
  labels,
  values,
  theme,
  left = 72,
  fontSize = 10,
  inverse = false,
  barWidth = 18,
  valueLabel = "{c}",
}: HorizontalBarOptions) {
  const accent = chartTheme(theme).accent;
  return {
    grid: { left, right: 24, top: 8, bottom: 8 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      data: labels,
      inverse,
      axisLabel: { fontSize },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth,
        data: values.map((v) => ({
          value: v.value,
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: (v.color ?? accent) + "60" },
                { offset: 1, color: v.color ?? accent },
              ],
            },
            borderRadius: [0, 6, 6, 0],
          },
        })),
        label: { show: true, position: "right", fontSize, formatter: valueLabel },
      },
    ],
  };
}
