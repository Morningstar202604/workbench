import { describe, expect, it } from "vitest";
import { SPAN_OPTIONS, normalizeSpans, spanOf } from "./layout";

/**
 * 组件宽度覆盖。
 *
 * 这里的关键不是「能存一个数字」，而是两个兼容性：
 * 1) 缺省用组件自带宽度（升级新增组件时不会丢宽度）；
 * 2) 任意数字被吸附到四档之一（旧数据、手改 localStorage 都能收敛）。
 */
describe("normalizeSpans", () => {
  it("非对象输入返回空表", () => {
    expect(normalizeSpans(null)).toEqual({});
    expect(normalizeSpans("x")).toEqual({});
    expect(normalizeSpans(42)).toEqual({});
  });

  it("丢弃未知组件 id", () => {
    expect(normalizeSpans({ nope: 6 })).toEqual({});
  });

  it("把任意数字吸附到最近档位", () => {
    expect(normalizeSpans({ kpis: 5 })).toEqual({ kpis: 4 });
    expect(normalizeSpans({ kpis: 7 })).toEqual({ kpis: 6 });
    expect(normalizeSpans({ kpis: 100 })).toEqual({ kpis: 12 });
    expect(normalizeSpans({ kpis: 1 })).toEqual({ kpis: 4 });
  });

  it("拒绝非数字值", () => {
    expect(normalizeSpans({ kpis: "6" })).toEqual({});
    expect(normalizeSpans({ kpis: Number.NaN })).toEqual({});
  });
});

describe("spanOf", () => {
  it("没有覆盖时用组件自带宽度", () => {
    expect(spanOf("kpis", {})).toBe(12);
  });

  it("有覆盖时用覆盖值", () => {
    expect(spanOf("kpis", { kpis: 6 })).toBe(6);
  });

  it("四档都在允许范围内", () => {
    for (const s of SPAN_OPTIONS) expect(spanOf("kpis", { kpis: s })).toBe(s);
  });
});
