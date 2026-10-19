import { describe, expect, it } from "vitest";
import { t } from "./index";

/**
 * 插值的边界行为。变量值来自错误信息、路径、进程名 —— 这些内容里
 * 出现 `$&` 或花括号并不罕见，字符串形式的 replaceAll 会把它们当替换模式解析。
 */
describe("t() 插值", () => {
  it("普通占位符被替换", () => {
    expect(t("store.killSent", { pid: 123 }, "zh")).toBe("已发送终止信号给进程 123");
  });

  it("变量值里的 $& 与 $$ 原样保留", () => {
    // 字符串形式下 $& 会被展开成匹配到的 {err}，$$ 折叠成 $
    const out = t("store.saveFailed", { err: "C:\\x $& y $$ z" }, "zh");
    expect(out).toBe("保存失败: C:\\x $& y $$ z");
  });

  it("变量值里含其它占位符时不会被二次替换", () => {
    // 先替换 {err}，其值含有 {pid}；若用字符串替换，后续 {pid} 会被一起吃掉
    const out = t("store.killFailed", { err: "pid={pid}" }, "zh");
    expect(out).toBe("终止失败: pid={pid}");
  });

  it("未提供的占位符保持原样", () => {
    expect(t("store.killSent", {}, "zh")).toBe("已发送终止信号给进程 {pid}");
  });

  it("未知 key 回退为 key 本身（三级回退的最后一级）", () => {
    expect(t("totally.unknown.key", undefined, "zh")).toBe("totally.unknown.key");
  });
});
