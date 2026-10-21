import { describe, expect, it } from "vitest";
import {
  buildTheme,
  luminance,
  mix,
  parseHex,
  toHex,
  withAlpha,
  type ThemeInput,
} from "./tokens";

const base: ThemeInput = {
  id: "test",
  name: "Test",
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

describe("颜色工具", () => {
  it("parseHex 支持 3 位与 6 位，非法值回退黑", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("22d3ee")).toEqual([34, 211, 238]);
    expect(parseHex("nope")).toEqual([0, 0, 0]);
  });

  it("toHex 四舍五入并补零", () => {
    expect(toHex([0, 5, 255])).toBe("#0005ff");
    expect(toHex([1.4, 2.6, 3.5])).toBe("#010304");
  });

  it("mix 在两端返回端点，中间是插值", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("withAlpha 生成合法 rgba", () => {
    expect(withAlpha("#22d3ee", 0.5)).toBe("rgba(34, 211, 238, 0.5)");
    // 越界值被夹住，而不是产生 rgba(...,1.5)
    expect(withAlpha("#000000", 9)).toContain("1)");
  });

  it("luminance 单调：白 > 灰 > 黑", () => {
    expect(luminance("#ffffff")).toBeGreaterThan(luminance("#808080"));
    expect(luminance("#808080")).toBeGreaterThan(luminance("#000000"));
  });
});

describe("buildTheme", () => {
  it("产出全部契约变量，且每个都有值", () => {
    const t = buildTheme(base);
    for (const key of [
      "--color-bg",
      "--color-panel",
      "--color-panel2",
      "--color-line",
      "--color-text",
      "--color-dim",
      "--color-faint",
      "--color-accent",
      "--color-accentsoft",
      "--color-ok",
      "--color-warn",
      "--color-danger",
      "--font-sans",
      "--font-display",
      "--font-mono",
      "--radius-card",
      "--radius-btn",
      "--shadow-card",
      "--space-card",
      "--line-height-body",
      "--hairline",
      "--hairline-strong",
      "--panel-opacity",
      "--panel-blur",
      "--grid-strength",
      "--glow",
    ]) {
      expect(t.vars[key], key).toBeTruthy();
    }
  });

  it("密度改变间距与行高，圆角独立可调", () => {
    const compact = buildTheme({ ...base, density: "compact" });
    const roomy = buildTheme({ ...base, density: "roomy" });
    expect(compact.vars["--space-card"]).not.toBe(roomy.vars["--space-card"]);
    expect(compact.vars["--line-height-body"]).not.toBe(roomy.vars["--line-height-body"]);

    const sharp = buildTheme({ ...base, radiusCard: 0 });
    expect(sharp.vars["--radius-card"]).toBe("0px");
  });

  it("字体选择改变 sans/mono 家族", () => {
    const mono = buildTheme({ ...base, font: "mono" });
    const serif = buildTheme({ ...base, font: "serif" });
    expect(mono.vars["--font-sans"].toLowerCase()).toContain("mono");
    expect(serif.vars["--font-sans"].toLowerCase()).toContain("serif");
    expect(mono.vars["--font-sans"]).not.toBe(serif.vars["--font-sans"]);
  });

  it("玻璃材质才给 blur，其他材质为 0px", () => {
    expect(buildTheme({ ...base, material: "glass" }).vars["--panel-blur"]).toBe("20px");
    expect(buildTheme({ ...base, material: "flat" }).vars["--panel-blur"]).toBe("0px");
    expect(buildTheme({ ...base, material: "line" }).vars["--glow"]).toBe("0");
  });

  it("图表色板与主题一致，且系列色以 accent 打头", () => {
    const t = buildTheme(base);
    expect(t.chart.bg).toBe(base.bg);
    expect(t.chart.panel).toBe(base.panel);
    expect(t.chart.series[0]).toBe(base.accent);
    expect(t.chart.accentSoft).toBe(t.vars["--color-accentsoft"]);
  });

  it("面板不透明度被夹在 0.2..1", () => {
    expect(buildTheme({ ...base, panelOpacity: 0 }).vars["--panel-opacity"]).toBe("0.2");
    expect(buildTheme({ ...base, panelOpacity: 5 }).vars["--panel-opacity"]).toBe("1");
  });

  it("亮色主题的派生色朝黑走，不会出现白字白底", () => {
    const light = buildTheme({
      ...base,
      dark: false,
      bg: "#ffffff",
      panel: "#ffffff",
      text: "#111111",
    });
    // dim/faint 是 text 与 bg 之间，必然比 text 浅、比 bg 深
    expect(luminance(light.vars["--color-dim"])).toBeGreaterThan(luminance("#111111"));
    expect(luminance(light.vars["--color-dim"])).toBeLessThan(luminance("#ffffff"));
  });
});
