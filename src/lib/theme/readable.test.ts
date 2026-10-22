import { describe, expect, it } from "vitest";
import { readableOn } from "./readable";
import { contrastRatio } from "./tokens";

/**
 * 主题卡片的副标题必须在每套主题自己的面板色上可读。
 * 这个函数被两个调用点共用；写死混合比例的版本在浅色主题上只有 2.8:1。
 */
describe("readableOn", () => {
  it("已经达标时原样返回文字色", () => {
    expect(readableOn("#000000", "#ffffff", 4.5)).toBe("#000000");
  });

  it("不达标时逐步混向底色，直到刚好达标", () => {
    const text = "#8a94a4";
    const bg = "#f2f4f7";
    expect(contrastRatio(text, bg)).toBeLessThan(4.5);
    const out = readableOn(text, bg, 4.5);
    expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("极端要求下返回最接近的值而不是抛错", () => {
    // 21:1 是黑白对比上限，纯红永远达不到；函数应稳定返回一个颜色
    const out = readableOn("#ff0000", "#ff0000", 21);
    expect(out).toMatch(/^#/);
  });

  it("深色底色同样适用", () => {
    const out = readableOn("#333333", "#000000", 4.5);
    expect(contrastRatio(out, "#000000")).toBeGreaterThanOrEqual(4.5);
  });
});
