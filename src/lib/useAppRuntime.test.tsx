import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppRuntime } from "./useAppRuntime";
import { useStore } from "./store";

/**
 * 应用级副作用的生命周期。
 *
 * 三段 effect 都做过「挂载时订阅、卸载时解绑」的手工处理，
 * 而漏解绑是最难在界面上发现的缺陷（切换页面越多次，监听器越多）。
 * 这里只验证「能正常挂载与卸载、不抛异常」，因为 jsdom 没有真实的
 * Tauri event 系统；真实 IPC 的解绑由 bundle 里的 tauri API 负责。
 */
describe("useAppRuntime", () => {
  beforeEach(() => {
    useStore.setState({ toast: "" });
  });

  it("挂载与卸载不抛异常", () => {
    expect(() => {
      const { unmount } = renderHook(() => useAppRuntime());
      unmount();
    }).not.toThrow();
  });

  it("ESC 在有 toast 时清空它", () => {
    useStore.setState({ toast: "hello" });
    const { unmount } = renderHook(() => useAppRuntime());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(useStore.getState().toast).toBe("");
    unmount();
  });

  it("没有 toast 时 ESC 不做任何事", () => {
    const { unmount } = renderHook(() => useAppRuntime());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(useStore.getState().toast).toBe("");
    unmount();
  });
});
