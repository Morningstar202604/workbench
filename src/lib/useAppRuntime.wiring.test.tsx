import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAppRuntime } from "./useAppRuntime";
import { useStore } from "./store";

/**
 * 应用级副作用的生命周期（进阶）。
 *
 * 前一组用例只覆盖了 ESC。这里补两件真正会出问题的行为：
 * 1) 窗口隐藏时轮询必须停表（否则后台一直采样，笔记本耗电）；
 * 2) Tauri 事件订阅在「组件先卸载、listen 后落地」时必须补一次解绑
 *    —— 漏解绑会让监听器越积越多，切页面越频繁越明显。
 */
const listeners: Array<{ event: string; handler: () => void }> = [];
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (event: string, handler: () => void) => {
    listeners.push({ event, handler });
    return unlisten;
  },
}));

const tauriMode = { value: true };
vi.mock("./api", async (orig) => {
  const actual = await orig<typeof import("./api")>();
  return { ...actual, isTauri: () => tauriMode.value };
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  listeners.length = 0;
  unlisten.mockClear();
  tauriMode.value = true;
  setVisibility("visible");
  useStore.setState({ toast: "", refreshMs: 3000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAppRuntime 轮询", () => {
  it("可见时按间隔刷新，隐藏时停表", async () => {
    const spy = vi.spyOn(useStore.getState(), "refreshRuntime");
    useStore.setState({ refreshRuntime: spy });
    renderHook(() => useAppRuntime());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    const callsWhileVisible = spy.mock.calls.length;
    expect(callsWhileVisible).toBeGreaterThanOrEqual(2);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(spy.mock.calls.length).toBe(callsWhileVisible);

    // 恢复可见：立刻补一次，再继续按间隔
    setVisibility("visible");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy.mock.calls.length).toBe(callsWhileVisible + 1);
  });

  it("演示模式不建定时器", async () => {
    tauriMode.value = false;
    const spy = vi.fn();
    useStore.setState({ refreshRuntime: spy });
    renderHook(() => useAppRuntime());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useAppRuntime 数据变更订阅", () => {
  it("收到 workbench://data-changed 时重载数据", async () => {
    const reload = vi.fn();
    useStore.setState({ reloadData: reload });
    renderHook(() => useAppRuntime());
    await act(async () => {
      await Promise.resolve();
    });
    const sub = listeners.find((l) => l.event === "workbench://data-changed");
    expect(sub).toBeDefined();
    sub!.handler();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("listen 落地前卸载也要解绑（防监听器泄漏）", async () => {
    const { unmount } = renderHook(() => useAppRuntime());
    // 不等 Promise：模拟组件在 listen 完成前就卸载
    unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(unlisten).toHaveBeenCalled();
  });
});
