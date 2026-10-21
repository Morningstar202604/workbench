/**
 * 主题 = 一组 token，而不是一段 CSS。
 *
 * 为什么重写：旧实现把五套配色写死在 global.css 的 `[data-theme=...]` 里，
 * 结果是「主题」= 五个只能由开发者新增的常量，用户既不能改也不能带回来。
 * 现在主题是纯数据：颜色、圆角、密度、字体、材质、动效各自独立，
 * 用户可以在设置里改任意一项、复制、导入导出，也能做出和内置五套完全不同的
 * 气质（例如高对比直角 + 等宽 + 无网格）。
 *
 * 派生规则集中在这里，页面和组件不感知主题细节。
 */

export type ThemeId = string;

export type FontChoice = "sans" | "serif" | "mono";
export type Density = "compact" | "cozy" | "roomy";
export type Material = "flat" | "line" | "glass";

export interface ThemeInput {
  id: ThemeId;
  name: string;
  dark: boolean;
  /** 六个核心色，其余全部派生 */
  bg: string;
  panel: string;
  text: string;
  accent: string;
  ok?: string;
  warn?: string;
  danger?: string;
  /** 形状与质感 */
  radiusCard: number;
  radiusBtn: number;
  density: Density;
  font: FontChoice;
  material: Material;
  /** 底纹网格：0 = 无，1 = 强 */
  grid: number;
  /** 面板不透明度（glass 材质下生效） */
  panelOpacity: number;
  /** 是否内置（内置不可删除） */
  builtin?: boolean;
}

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  dark: boolean;
  vars: Record<string, string>;
  /** 图表用色，顺序固定，跨图一致 */
  chart: {
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
    series: string[];
  };
}

// ── 颜色工具（不引依赖，主题编辑只要这两三个函数） ──────────

export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function toHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

/** amount=0 取 a，1 取 b */
export function mix(a: string, b: string, amount: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const k = Math.max(0, Math.min(1, amount));
  return toHex([r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k]);
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** 相对亮度，用于判断某个底色上该用深字还是浅字 */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── 派生 ───────────────────────────────────────────────────

const LINE_STRENGTH: Record<Density, number> = {
  compact: 0.13,
  cozy: 0.1,
  roomy: 0.16,
};

const SPACE: Record<Density, string> = {
  compact: "0.75rem",
  cozy: "1rem",
  roomy: "1.375rem",
};

const LINE_HEIGHT: Record<Density, string> = {
  compact: "1.45",
  cozy: "1.55",
  roomy: "1.65",
};

const FONTS: Record<FontChoice, { sans: string; display: string; mono: string }> = {
  sans: {
    sans: `"Segoe UI Variable Display", "Segoe UI", -apple-system, "PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif`,
    display: `"Segoe UI Variable Display", "Segoe UI", -apple-system, "PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif`,
    mono: `"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, ui-monospace, monospace`,
  },
  serif: {
    sans: `"Iowan Old Style", "Palatino Linotype", "Songti SC", "SimSun", Georgia, serif`,
    display: `"Iowan Old Style", "Palatino Linotype", "Songti SC", "SimSun", Georgia, serif`,
    mono: `"Cascadia Code", "JetBrains Mono", Consolas, ui-monospace, monospace`,
  },
  mono: {
    sans: `"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, ui-monospace, monospace`,
    display: `"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, ui-monospace, monospace`,
    mono: `"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, ui-monospace, monospace`,
  },
};

/**
 * 把用户输入展开成完整 token。
 *
 * 只让用户填「六个颜色 + 五个旋钮」的原因：完整 token 有二十多个，
 * 逐个填是把设计系统的负担丢给用户。其余值都能从这六个色推出来，
 * 且推导是单调的——改 accent 不会破坏对比度层级。
 */
export function buildTheme(input: ThemeInput): ThemeTokens {
  const ok = input.ok ?? (input.dark ? "#3ecf8e" : "#0b7a54");
  const warn = input.warn ?? (input.dark ? "#f5b544" : "#a86400");
  const danger = input.danger ?? (input.dark ? "#ff6b6b" : "#c02b2b");

  const toward = input.dark ? "#ffffff" : "#000000";
  const away = input.dark ? "#000000" : "#ffffff";
  const strength = LINE_STRENGTH[input.density];

  const panel2 = mix(input.panel, input.bg, 0.45);
  const line = mix(input.text, input.bg, 1 - strength);
  const dim = mix(input.text, input.bg, 0.42);
  const faint = mix(input.text, input.bg, 0.62);
  const accentsoft = mix(input.panel, input.accent, input.dark ? 0.18 : 0.12);

  const fonts = FONTS[input.font];
  const radiusCard = `${input.radiusCard}px`;
  const radiusBtn = `${input.radiusBtn}px`;
  const shadow =
    input.material === "flat"
      ? "none"
      : input.dark
        ? `0 1px 2px ${withAlpha("#000000", 0.5)}, 0 18px 40px -24px ${withAlpha("#000000", 0.9)}`
        : `0 1px 2px ${withAlpha("#101828", 0.06)}, 0 14px 30px -22px ${withAlpha("#101828", 0.28)}`;

  const vars: Record<string, string> = {
    "--color-bg": input.bg,
    "--color-panel": input.panel,
    "--color-panel2": panel2,
    "--color-line": line,
    "--color-text": input.text,
    "--color-dim": dim,
    "--color-faint": faint,
    "--color-accent": input.accent,
    "--color-accentsoft": accentsoft,
    "--color-ok": ok,
    "--color-warn": warn,
    "--color-danger": danger,
    "--font-sans": fonts.sans,
    "--font-display": fonts.display,
    "--font-mono": fonts.mono,
    "--radius-card": radiusCard,
    "--radius-btn": radiusBtn,
    "--shadow-card": shadow,
    "--space-card": SPACE[input.density],
    "--line-height-body": LINE_HEIGHT[input.density],
    "--tracking-heading": input.font === "serif" ? "0.005em" : "-0.02em",
    "--hairline": withAlpha(input.text, input.dark ? 0.08 : 0.1),
    "--hairline-strong": withAlpha(input.text, input.dark ? 0.14 : 0.18),
    "--panel-opacity": String(Math.max(0.2, Math.min(1, input.panelOpacity))),
    "--panel-blur": input.material === "glass" ? "20px" : "0px",
    "--grid-strength": String(Math.max(0, Math.min(1, input.grid))),
    "--glow": input.material === "glass" ? "1" : "0",
    // 浅色底上给卡片加白色高光只会把它洗灰，所以浅色主题一律关掉
    "--card-sheen": input.dark ? "3.5" : "0",
    // 直角主题的「硬边框」细节（方角激活线等）
    "--toward-light": toward,
    "--toward-dark": away,
  };

  return {
    id: input.id,
    name: input.name,
    dark: input.dark,
    vars,
    chart: {
      bg: input.bg,
      panel: input.panel,
      line,
      text: input.text,
      dim,
      accent: input.accent,
      accentSoft: accentsoft,
      ok,
      warn,
      danger,
      series: [input.accent, "#a78bfa", ok, warn, danger, "#60a5fa", "#e879f9"],
    },
  };
}
