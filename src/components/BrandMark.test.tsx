import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BrandMark } from "./BrandMark";

/**
 * 品牌字形的硬约束：直接贴在任意底色上，不能自带底板。
 *
 * 这条是上一轮回归的延续：旧资源是白底 JPEG 抠图，深色侧栏上留下过
 * 一圈白方块。现在的实现是纯矢量笔画，没有 rect / image / 底色，
 * 任何「补一块底」的改动都会在这里失败。
 */
describe("BrandMark", () => {
  it("只由路径构成，没有底板矩形或位图", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeInTheDocument();
    expect(svg.querySelectorAll("path").length).toBe(4);
    expect(svg.querySelector("rect")).toBeNull();
    expect(svg.querySelector("image")).toBeNull();
    // fill 必须为 none：唯一着色来自描边，背景完全透出
    expect(svg.getAttribute("fill")).toBe("none");
  });

  it("描边使用 currentColor，随主题文字色走", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });

  it("渐变模式下有唯一 id，避免同页多个实例互相覆盖", () => {
    const { container } = render(
      <>
        <BrandMark gradient />
        <BrandMark gradient />
      </>
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((n) => n.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(container.querySelector(`#${CSS.escape(id)}`)).not.toBeNull();
    }
  });

  it("无 title 时对辅助技术隐藏，有 title 时作为 img 暴露", () => {
    const { container, rerender } = render(<BrandMark />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    rerender(<BrandMark title="工作台" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
    expect(svg.querySelector("title")!.textContent).toBe("工作台");
  });
});
