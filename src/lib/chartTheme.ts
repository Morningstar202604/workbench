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
/**
 * 图表只关心明暗两档：五种风格共享两套图表配色，
 * 因为图表需要的是「在深底还是浅底上可读」，而不是某个风格的品牌色。
 * 品牌色通过 seriesColors 从 CSS 变量取，见下。
 */
export type ThemeName = "dark" | "light";

/** 任意风格 id → 图表明暗档。未知值按深色处理。 */
export function toThemeName(styleId: string | undefined): ThemeName {
  if (!styleId) return "dark";
  if (styleId === "light" || styleId === "frost" || styleId === "paper") return "light";
  if (typeof document !== "undefined") {
    const attr = document.documentElement.dataset.chartTheme;
    if (attr === "light") return "light";
  }
  return "dark";
}

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
  bg: "#07080b",
  panel: "#0c0f15",
  line: "#1b212c",
  text: "#e8ecf2",
  dim: "#8a93a6",
  accent: "#22d3ee",
  accentSoft: "#0d2f38",
  ok: "#3ecf8e",
  warn: "#f5b544",
  danger: "#ff6b6b",
};

export const LIGHT: ChartTheme = {
  bg: "#f2f4f7",
  panel: "#ffffff",
  line: "#e2e7ee",
  text: "#10141b",
  dim: "#5b6575",
  accent: "#0b6bcb",
  accentSoft: "#e6f0fc",
  ok: "#0b7a54",
  warn: "#a86400",
  danger: "#c02b2b",
};

export function chartTheme(theme: ThemeName | string): ChartTheme {
  return toThemeName(theme) === "light" ? LIGHT : DARK;
}

/**
 * 语义色板：原先在 6 个页面里各写一份 hex 数组（AiSessions / Overview /
 * Processes / Servers / Tasks / Projects），改一处就漏其余。统一到这里，
 * 浅色主题取低饱和版本以保证对比度。
 */
export const PALETTE = {
  cyan: "#22d3ee",
  violet: "#a78bfa",
  green: "#3ecf8e",
  amber: "#f5b544",
  red: "#ff6b6b",
  blue: "#60a5fa",
  fuchsia: "#e879f9",
  slate: "#64748b",
} as const;

/** 多系列图表按序取色。浅色主题下 cyan/green/amber/red 换成深色版本。 */
export function seriesColors(theme: ThemeName | string): string[] {
  const t = chartTheme(theme);
  return [
    t.accent,
    PALETTE.violet,
    t.ok,
    t.warn,
    t.danger,
    PALETTE.blue,
    PALETTE.fuchsia,
  ];
}

/** 单色（不随主题）的固定语义色，用于分类标签等不参与主题切换的场景。 */
export const FIXED_COLORS = {
  browser: PALETTE.cyan,
  dev: PALETTE.violet,
  ai: PALETTE.amber,
  system: PALETTE.green,
  other: PALETTE.slate,
  low: PALETTE.slate,
  normal: PALETTE.cyan,
  high: PALETTE.red,
} as const;

/**
 * 图表中「环形图扇区之间的间隙」应使用的颜色 —— 即面板背景色。
 * 不传参时回退读 DOM，供无法拿到 theme 的场景（如测试）使用。
 */
export function chartGapColor(theme?: string): string {
  if (theme) return chartTheme(theme).bg;
  if (typeof document === "undefined") return DARK.bg;
  return document.documentElement.dataset.theme === "light" ? LIGHT.bg : DARK.bg;
}

/** 当前主题下的分隔线颜色（用于空数据占位图元）。 */
export function chartLineColor(theme?: string): string {
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
  theme: ThemeName | string;
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
    // 右侧留够空间给数值标签：值为 0 时条形长度为 0，
    // 标签会紧贴左边缘，right 太小时更容易被裁掉。
    grid: { left, right: 40, top: 8, bottom: 8 },
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
        id: "bar",
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
        label: {
          show: true,
          position: "right",
          fontSize,
          formatter: valueLabel,
          // 0 值也显示，但用弱化色，避免看起来像数据缺失
          color: "inherit",
          opacity: 0.75,
        },
      },
    ],
  };
}
