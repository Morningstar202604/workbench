import { describe, expect, it } from "vitest";
import { shellLayout } from "./useShellLayout";
import type { ShellId } from "./layout";

/**
 * 外壳布局决策。
 *
 * 这里的每条规则都对应一次真实缺陷：
 * - 窄屏没回退侧栏 → 390px 下导航被挤成横滚条
 * - 专注外壳没把侧栏压成图标条 → 侧栏占了 212px，单列内容被压窄
 * - 顶部坞还渲染侧栏 → 导航出现两份
 */
const SHELLS: ShellId[] = ["rail", "dock", "zen"];

describe("shellLayout", () => {
  it("wide + rail：侧栏常驻、可折叠", () => {
    const l = shellLayout("wide", "rail", false);
    expect(l.effective).toBe("rail");
    expect(l.showRail).toBe(true);
    expect(l.railCollapsed).toBe(false);
    expect(l.dock).toBe(false);
    expect(l.narrowContent).toBe(false);
  });

  it("wide + rail + 用户折叠：侧栏压成图标条", () => {
    expect(shellLayout("wide", "rail", true).railCollapsed).toBe(true);
  });

  it("wide + dock：不渲染侧栏，顶栏换成坞", () => {
    const l = shellLayout("wide", "dock", false);
    expect(l.showRail).toBe(false);
    expect(l.dock).toBe(true);
    expect(l.effective).toBe("dock");
  });

  it("wide + zen：侧栏保留但强制图标条，内容单列居中", () => {
    const l = shellLayout("wide", "zen", false);
    expect(l.showRail).toBe(true);
    expect(l.railCollapsed).toBe(true);
    expect(l.narrowContent).toBe(true);
  });

  it("compact 下三种外壳都回退成侧栏抽屉", () => {
    for (const shell of SHELLS) {
      const l = shellLayout("compact", shell, false);
      expect(l.effective, shell).toBe("rail");
      expect(l.showRail, shell).toBe(true);
      expect(l.dock, shell).toBe(false);
      expect(l.narrowContent, shell).toBe(false);
    }
  });

  it("compact 下不因专注外壳强制折叠（抽屉需要完整宽度）", () => {
    expect(shellLayout("compact", "zen", false).railCollapsed).toBe(false);
    expect(shellLayout("compact", "rail", true).railCollapsed).toBe(false);
  });

  it("medium 断点按 wide 规则处理外壳（只有窄屏回退）", () => {
    const l = shellLayout("medium", "dock", false);
    expect(l.effective).toBe("dock");
    expect(l.dock).toBe(true);
  });
});
