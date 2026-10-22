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

/**
 * 在 text 与 bg 之间找一个「尽可能淡、但仍满足对比度」的颜色。
 *
 * 直接写死混合比例在深色主题上够用、在浅色主题上会掉到 4.3:1：
 * 浅色底上同样比例的混合离白色更近，对比度衰减更快。所以这里按
 * 实际对比度求解，而不是按比例。
 *
 * 返回 (颜色, 实际最低对比度)。
 */
export function mixUntilContrast(
  text: string,
  bg: string,
  otherSurfaces: string[],
  minRatio: number,
  maxMix = 0.72
): { color: string; ratio: number } {
  const worst = (c: string) =>
    Math.min(contrastRatio(c, bg), ...otherSurfaces.map((s) => contrastRatio(c, s)));

  // 目标对比度有可能高于原文的对比度（用户选了低对比文字时）。
  // 这时先朝「远离底色」的方向强化到达标，再从那里往底色方向淡 ——
  // 否则只往底色方向走，对比度只会越来越低，永远达不到目标。
  let base = text;
  if (worst(base) < minRatio) {
    base = ensureTextContrast(text, [bg, ...otherSurfaces], bg, minRatio);
  }
  if (worst(base) < minRatio) {
    // 表面之间跨度大到无解：返回当前最优，由调用方断言/告警
    return { color: base, ratio: worst(base) };
  }

  // 从 base 往底色方向逐步淡，记录「最后一个仍达标的档位」。
  // 这样拿到的是「刚好卡在 minRatio 附近、但明显弱于 base」的一档，
  // 既保住层次，又不会把文字淡到不可读。
  let bestColor = base;
  let bestRatio = worst(base);
  for (let i = 1; i <= Math.round(maxMix * 100); i++) {
    const c = mix(base, bg, i / 100);
    const r = worst(c);
    if (r >= minRatio) {
      bestColor = c;
      bestRatio = r;
    } else {
      break;
    }
  }
  return { color: bestColor, ratio: bestRatio };
}

/**
 * 把一个颜色朝 `toward` 混到「在给定表面上至少满足 minRatio」为止。
 *
 * 用于强调色：品牌色本身往往是给大面积填充选的（例如紫 #8b5cf6），
 * 直接拿来当 11px 文字色只有 4.0:1。这里保持色相不变、只调明度，
 * 既保住品牌辨识度，又保证小字可读。
 */
export function ensureTextContrast(
  color: string,
  surfaces: string[],
  _toward: string,
  minRatio: number,
  maxMix = 0.95
): string {
  const worst = (c: string) => Math.min(...surfaces.map((s) => contrastRatio(c, s)));
  if (worst(color) >= minRatio) return color;

  // 两个方向都试：朝白、朝黑。取「第一个达标且混合量最小」的那个，
  // 这样色相偏移最小。
  //
  // 只朝一个方向走是错的：浅色底上的浅灰文字朝白色混永远不达标
  // （白与白 1:1），一路混到纯白，等于把用户的文字色洗没了。
  let best: { color: string; steps: number } | null = null;
  for (const target of ["#ffffff", "#000000"]) {
    for (let i = 1; i <= Math.round(maxMix * 100); i++) {
      const c = mix(color, target, i / 100);
      if (worst(c) >= minRatio) {
        if (!best || i < best.steps) best = { color: c, steps: i };
        break;
      }
    }
  }
  if (best) return best.color;

  // 两个方向都不达标（表面之间本身跨度极大）：返回对比度最高的那一档，
  // 而不是随便返回一个 —— 至少保证可读性最大化。
  let fallback = color;
  let bestRatio = worst(color);
  for (let i = 1; i <= 100; i++) {
    for (const target of ["#ffffff", "#000000"]) {
      const c = mix(color, target, i / 100);
      const r = worst(c);
      if (r > bestRatio) {
        bestRatio = r;
        fallback = c;
      }
    }
  }
  return fallback;
}

/** WCAG 2.x 对比度（1..21）。 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
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

  const strength = LINE_STRENGTH[input.density];

  // dim / faint 都由「对比度下限」求解，而不是写死混合比例：
  // 同一比例在深色底和浅色底上的实际对比度差很多（浅色主题上会掉到 4.3:1）。
  // 目标：dim ≥ 6.0:1、faint ≥ 4.7:1（高于 WCAG AA 的 4.5，留一点抗渲染误差余量），
  // 两者都要同时满足「页面底色」与「面板底色」两个表面。
  // 文字可能落在页面底、面板底、次级面板底（表格斑马纹）三种表面上。
  const panel2Preview = mix(input.panel, input.bg, 0.45);
  const surfaces = [input.bg, input.panel, panel2Preview];
  // 用户可能把文字色选得和底色几乎一样（浅灰配白、深灰配黑）。
  // 正文是唯一不允许降级的元素：先用它自己过一遍对比度门槛，
  // 后续 dim/faint 都以这个「可读的正文色」为基准往外淡。
  const text = ensureTextContrast(
    input.text,
    surfaces,
    input.dark ? "#ffffff" : "#000000",
    4.6
  );
  const dim = mixUntilContrast(text, input.bg, surfaces, 6.0).color;
  const faint = mixUntilContrast(text, input.bg, surfaces, 4.7).color;
  const panel2 = mix(input.panel, input.bg, 0.45);
  const line = mix(text, input.bg, 1 - strength);
  // 强调色同时承担「填充」与「小字」两种角色，必须两者都成立：
  // 填充看的是它与背景的辨识度，小字看的是 4.5:1。这里只调明度、不动色相。
  const toward = input.dark ? "#ffffff" : "#000000";
  // 4.6 而不是 4.5：给不同渲染后端（DirectWrite / Skia）留一点抗锯齿误差。
  const accent = ensureTextContrast(input.accent, surfaces, toward, 4.6);
  // 语义色同样会当小字用（徽章、状态文字），一起过同一道门槛。
  const okSafe = ensureTextContrast(ok, surfaces, toward, 4.6);
  const warnSafe = ensureTextContrast(warn, surfaces, toward, 4.6);
  const dangerSafe = ensureTextContrast(danger, surfaces, toward, 4.6);
  const accentsoft = mix(input.panel, accent, input.dark ? 0.18 : 0.12);
  // 主按钮的文字色：必须在 accent 填充上可读，且与主题深浅无关。
  // 写死 #04120f 在浅色主题（accent 变深）上会变成深字压深底。
  const onAccent =
    ensureTextContrast("#ffffff", [accent], accent, 4.5) === "#ffffff"
      ? "#ffffff"
      : ensureTextContrast("#000000", [accent], accent, 4.5);

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
    "--color-text": text,
    "--color-dim": dim,
    "--color-faint": faint,
    "--color-accent": accent,
    "--color-on-accent": onAccent,
    "--color-accentsoft": accentsoft,
    "--color-ok": okSafe,
    "--color-warn": warnSafe,
    "--color-danger": dangerSafe,
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
      accent,
      accentSoft: accentsoft,
      ok: okSafe,
      warn: warnSafe,
      danger: dangerSafe,
      series: [accent, "#a78bfa", okSafe, warnSafe, dangerSafe, "#60a5fa", "#e879f9"],
    },
  };
}
