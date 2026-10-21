/**
 * 主题系统：一套数据、多种视觉与布局语言。
 *
 * 设计分两层：
 * - **palette**（颜色）：通过 CSS 变量喂给 Tailwind 的 `--color-*`。
 * - **shape / layout**（形状与排版）：圆角、阴影、间距密度、字体，
 *   以及 shell 的布局变体（侧栏样式、卡片密度）。
 *
 * 为什么分两层：只换颜色是「换皮」，用户要的是"同一批数据在不同设计语言里
 * 呈现不同气质"——Apple 风的留白与圆润、纸质书的衬线正文与宽边距、
 * 玻璃拟态的透明层叠，这些都必须改形状与间距，而不能只改 hue。
 */

export type StyleId = "midnight" | "frost" | "paper" | "aurora" | "terminal";

/** 外壳布局变体：决定侧栏形态、卡片密度与内容节奏。 */
export type ShellVariant = "dense" | "airy" | "reading" | "glass" | "mono";

export interface StyleDef {
  id: StyleId;
  /** 界面显示名（品牌名不翻译） */
  name: string;
  /** 一句话描述，设置页展示 */
  tagline: Record<"en" | "zh" | "ja", string>;
  shell: ShellVariant;
  /** 是否深色底（用于图表主题选择、以及需要判断明暗的逻辑） */
  dark: boolean;
  /** 设置页预览用的色块顺序：底、面板、强调、文字 */
  swatch: [string, string, string, string];
}

export const STYLES: StyleDef[] = [
  {
    id: "midnight",
    name: "Midnight",
    tagline: {
      en: "Dense dark console — everything at a glance",
      zh: "紧凑深色控制台 —— 信息密度优先",
      ja: "高密度ダークコンソール",
    },
    shell: "dense",
    dark: true,
    swatch: ["#07080b", "#0c0f15", "#22d3ee", "#e8ecf2"],
  },
  {
    id: "frost",
    name: "Frost",
    tagline: {
      en: "Light, airy, large radii — calm and spacious",
      zh: "通透留白、大圆角 —— 安静而舒展",
      ja: "明るく余白の多い、大きな角丸",
    },
    shell: "airy",
    dark: false,
    swatch: ["#f2f4f7", "#ffffff", "#0b6bcb", "#10141b"],
  },
  {
    id: "paper",
    name: "Paper",
    tagline: {
      en: "Warm paper, serif headings, generous margins",
      zh: "暖白纸感、衬线标题、宽边距阅读节奏",
      ja: "温かい紙色とセリフ見出し",
    },
    shell: "reading",
    dark: false,
    swatch: ["#f3eee5", "#fbf8f2", "#8a5a2b", "#241f19"],
  },
  {
    id: "aurora",
    name: "Aurora",
    tagline: {
      en: "Translucent glass over a shifting gradient",
      zh: "渐变之上浮动的半透明玻璃层",
      ja: "グラデーション上の半透明ガラス",
    },
    shell: "glass",
    dark: true,
    swatch: ["#080a18", "#141a33", "#8b5cf6", "#eaeefe"],
  },
  {
    id: "terminal",
    name: "Terminal",
    tagline: {
      en: "Mono type, sharp corners, high contrast",
      zh: "等宽字体、直角、高对比",
      ja: "等幅フォントと直角の高コントラスト",
    },
    shell: "mono",
    dark: true,
    swatch: ["#050706", "#0a0e0b", "#3ddc84", "#d9f5d9"],
  },
];

export const DEFAULT_STYLE: StyleId = "midnight";

export function styleOf(id: string): StyleDef {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

/** 兼容旧版本持久化的 "dark" / "light"。 */
export function migrateStyle(raw: unknown): StyleId {
  if (typeof raw === "string") {
    if (STYLES.some((s) => s.id === raw)) return raw as StyleId;
    if (raw === "light") return "frost";
    if (raw === "dark") return "midnight";
  }
  return DEFAULT_STYLE;
}

/** 该主题下图表应用浅色还是深色底。 */
export function chartThemeFor(id: string): "dark" | "light" {
  return styleOf(id).dark ? "dark" : "light";
}
