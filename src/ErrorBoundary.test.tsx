import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";
import { setLang } from "./lib/i18n";

// 锁定界面语言：兜底 UI 文案按中文断言（默认语言是英语）
setLang("zh");

/** 必须在类组件外抛错才会被边界捕获，这里用一个会炸的子组件。 */
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("爆炸测试");
  return <p>正常</p>;
}

describe("ErrorBoundary", () => {
  // 拦截测试期间的 console.error（React 会打两遍错误日志）
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("子组件正常时不拦截", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("正常")).toBeInTheDocument();
  });

  it("子组件抛错时显示兜底 UI 与错误信息", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("页面渲染异常")).toBeInTheDocument();
    expect(screen.getByText("爆炸测试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重试/ })).toBeInTheDocument();
  });

  it("点击重试后重置状态重新渲染子树", async () => {
    let shouldThrow = true;
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );
    expect(screen.getByText("页面渲染异常")).toBeInTheDocument();

    shouldThrow = false;
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );
    // 边界仍处于 error 状态 —— 必须点重试才恢复
    await userEvent.click(screen.getByRole("button", { name: /重试/ }));
    expect(screen.getByText("正常")).toBeInTheDocument();
  });
});
