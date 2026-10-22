import { describe, expect, it } from "vitest";
import {
  DARK,
  LIGHT,
  chartGapColor,
  chartLineColor,
  chartTheme,
  horizontalBarOption,
  registerChartTheme,
  seriesColors,
} from "./chartTheme";

/**
 * 图表配色与选项构造器。
 *
 * 这些是纯函数，但直接决定「图表能不能看清」：缝隙色取错会在浅色主题上
 * 露出一圈灰线（真实回归过），系列色取错会让两条线同色。
 */
describe("chartTheme 注册表", () => {
  it("未注册的 id 按明暗兜底", () => {
    expect(chartTheme("frost")).toBe(LIGHT);
    expect(chartTheme("paper")).toBe(LIGHT);
    expect(chartTheme("midnight")).toBe(DARK);
    expect(chartTheme("some-unknown")).toBe(DARK);
  });

  it("注册后按 id 取到自定义色板", () => {
    registerChartTheme("custom-x", { ...DARK, accent: "#ff0000" });
    expect(chartTheme("custom-x").accent).toBe("#ff0000");
  });
});

describe("seriesColors", () => {
  it("首色等于主题强调色（保证主系列与品牌一致）", () => {
    expect(seriesColors("midnight")[0]).toBe(DARK.accent);
  });

  it("自定义色板优先于内置组合", () => {
    registerChartTheme("custom-y", {
      ...DARK,
      series: ["#111111", "#222222"],
    });
    expect(seriesColors("custom-y")).toEqual(["#111111", "#222222"]);
  });
});

describe("chartGapColor", () => {
  it("取面板色而不是页面底色", () => {
    // 真实回归：取底色时浅色主题的白色卡片里会露出一圈灰线
    expect(chartGapColor("frost")).toBe(LIGHT.panel);
    expect(chartGapColor("midnight")).toBe(DARK.panel);
    expect(chartGapColor("frost")).not.toBe(LIGHT.bg);
  });
});

describe("chartLineColor", () => {
  it("取主题分隔线色", () => {
    expect(chartLineColor("frost")).toBe(LIGHT.line);
    expect(chartLineColor("midnight")).toBe(DARK.line);
  });
});

describe("horizontalBarOption", () => {
  const base = {
    labels: ["A", "B"],
    values: [{ value: 3 }, { value: 0 }],
    theme: "midnight" as const,
  };

  it("条数、标签与数值一一对应", () => {
    const o = horizontalBarOption(base);
    const series = o.series[0];
    expect(series.data).toHaveLength(2);
    expect(series.data[0].value).toBe(3);
    expect(o.yAxis.data).toEqual(["A", "B"]);
  });

  it("0 值也保留（不能因为长度为 0 就不画，否则看起来像数据缺失）", () => {
    const o = horizontalBarOption(base);
    expect(o.series[0].data[1].value).toBe(0);
  });

  it("自定义颜色覆盖默认渐变", () => {
    const o = horizontalBarOption({
      ...base,
      values: [{ value: 1, color: "#abcdef" }],
    });
    const stops = o.series[0].data[0].itemStyle.color.colorStops;
    expect(stops[1].color).toBe("#abcdef");
  });

  it("右侧留白足够放下数值标签", () => {
    // right 太小会把 "3" 这类标签裁掉
    expect(horizontalBarOption(base).grid.right).toBeGreaterThanOrEqual(32);
  });

  it("inverse 透传到类目轴", () => {
    expect(horizontalBarOption({ ...base, inverse: true }).yAxis.inverse).toBe(true);
  });
});

/**
 * 不传主题时的 DOM 分支。
 *
 * 这两个函数在页面里多数是「不传 theme」调用的（图表在 hover/重绘时取当前
 * 主题），所以 document.dataset 分支才是主路径；原先只测了显式传参。
 */
describe("未传主题时跟随 data-chart-theme", () => {
  it("浅色标记下取 LIGHT 的面板与分隔线", () => {
    document.documentElement.dataset.chartTheme = "light";
    expect(chartGapColor()).toBe(LIGHT.panel);
    expect(chartLineColor()).toBe(LIGHT.line);
    delete document.documentElement.dataset.chartTheme;
  });

  it("默认（深色）取 DARK", () => {
    delete document.documentElement.dataset.chartTheme;
    expect(chartGapColor()).toBe(DARK.panel);
    expect(chartLineColor()).toBe(DARK.line);
  });
});
