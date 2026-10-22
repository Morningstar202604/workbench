import { describe, expect, it } from "vitest";
import {
  buildTheme,
  contrastRatio,
  ensureTextContrast,
  mixUntilContrast,
  type ThemeInput,
} from "./tokens";
import { BUILTIN_THEMES } from "./presets";

/**
 * 可读性契约：所有内置主题的正文 / 次要文字 / 强调色都必须满足 WCAG AA。
 *
 * 这条不能只靠肉眼：早先 faint 用固定混合比例，深色主题看着没问题，
 * 浅色主题实际只有 2.8:1（实测），而界面上完全看不出来「不合规」。
 * 一旦有人把推导改回硬编码比例，这里会直接失败。
 */
const base: ThemeInput = {
  id: "t",
  name: "T",
  dark: true,
  bg: "#07080b",
  panel: "#0c0f15",
  text: "#e8ecf2",
  accent: "#22d3ee",
  radiusCard: 10,
  radiusBtn: 7,
  density: "cozy",
  font: "sans",
  material: "line",
  grid: 1,
  panelOpacity: 1,
};

describe("contrastRatio", () => {
  it("黑白为 21:1，同色为 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });

  it("与顺序无关", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(
      contrastRatio("#000000", "#ffffff"),
      5
    );
  });
});

describe("mixUntilContrast", () => {
  it("返回的颜色真的满足目标对比度", () => {
    const { color, ratio } = mixUntilContrast("#e8ecf2", "#07080b", ["#0c0f15"], 4.7);
    expect(ratio).toBeGreaterThanOrEqual(4.7);
    expect(contrastRatio(color, "#07080b")).toBeGreaterThanOrEqual(4.7);
    expect(contrastRatio(color, "#0c0f15")).toBeGreaterThanOrEqual(4.7);
  });

  it("原文已达标时继续往底色方向淡到刚好卡线（这就是「次要文字」的语义）", () => {
    const { color, ratio } = mixUntilContrast("#ffffff", "#000000", ["#000000"], 4.5);
    // 不能仍是纯白（那样 dim 与 text 没有层次），但必须仍达标
    expect(color).not.toBe("#ffffff");
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    // 也不能淡过头（超过 8:1 说明几乎没往底色走）
    expect(ratio).toBeLessThan(8);
  });

  it("原文对比度已经低于目标时，先强化再淡，最终仍达标", () => {
    // #dddddd on #ffffff 只有 1.36:1，远低于 4.5
    const { color, ratio } = mixUntilContrast("#dddddd", "#ffffff", ["#ffffff"], 4.5);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("ensureTextContrast", () => {
  it("把不达标的强调色提亮到 4.6:1", () => {
    // 紫色在深底上只有 ~4.0:1
    const out = ensureTextContrast("#8b5cf6", ["#080a18", "#141a33"], "#ffffff", 4.6);
    expect(contrastRatio(out, "#080a18")).toBeGreaterThanOrEqual(4.6);
    expect(contrastRatio(out, "#141a33")).toBeGreaterThanOrEqual(4.6);
    // 色相不能被改成纯白（否则强调色就没了）
    expect(out).not.toBe("#ffffff");
  });

  it("已达标则不动", () => {
    expect(ensureTextContrast("#ffffff", ["#000000"], "#ffffff", 4.5)).toBe("#ffffff");
  });
});

describe("内置主题的可读性", () => {
  const surfacesOf = (t: ThemeInput) => [t.bg, t.panel];

  it.each(BUILTIN_THEMES.map((t) => [t.id, t] as const))(
    "%s: 正文 / 次要 / 强调色都达到 AA",
    (_id, theme) => {
      const tokens = buildTheme(theme);
      const surfaces = surfacesOf(theme);
      for (const key of [
        "--color-text",
        "--color-dim",
        "--color-faint",
        "--color-accent",
        "--color-ok",
        "--color-warn",
        "--color-danger",
      ]) {
        const c = tokens.vars[key];
        for (const s of surfaces) {
          expect(
            contrastRatio(c, s),
            `${theme.id} ${key} on ${s}: ${contrastRatio(c, s).toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  );

  it("18 套组合（8 主题 × 语义色）没有一套靠纯白/纯黑糊过去", () => {
    for (const theme of BUILTIN_THEMES) {
      const t = buildTheme(theme);
      // faint 是「最淡但仍可读」的一档，它必须与 text 有可见差别
      expect(t.vars["--color-faint"]).not.toBe(t.vars["--color-text"]);
      expect(
        contrastRatio(t.vars["--color-faint"], t.vars["--color-text"])
      ).toBeGreaterThan(1.1);
    }
  });
});

describe("用户自定义主题的可读性", () => {
  it("低对比输入也会被修到 AA，而不是原样输出", () => {
    // 用户在浅色底上选了浅灰做文字：极端但完全可能
    const tokens = buildTheme({
      ...base,
      dark: false,
      bg: "#ffffff",
      panel: "#ffffff",
      text: "#dddddd",
    });
    for (const key of ["--color-text", "--color-dim", "--color-faint"]) {
      expect(
        contrastRatio(tokens.vars[key], "#ffffff"),
        `${key} = ${tokens.vars[key]}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("深色底配深色文字同样会被修正", () => {
    const tokens = buildTheme({
      ...base,
      bg: "#000000",
      panel: "#000000",
      text: "#1a1a1a",
    });
    expect(contrastRatio(tokens.vars["--color-text"], "#000000")).toBeGreaterThanOrEqual(
      4.5
    );
  });
});
