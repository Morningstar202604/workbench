import { describe, expect, it } from "vitest";
import { classifyOpenTarget, isUrlScheme } from "./openTarget";

/**
 * 回归：openExternal 曾用 `/^[a-z][a-z0-9+.-]*:/` 判 scheme，
 * 把 `C:\proj` 当成了 scheme，导致项目页 / 服务器页的「打开目录」
 * 全部抛错且无人 catch —— 点击后界面毫无反应。
 */
describe("Windows 路径不能被当作 URL scheme", () => {
  it.each([
    ["C:\\proj\\shop-web", "盘符反斜杠"],
    ["C:/proj/shop-web", "盘符正斜杠"],
    ["D:\\work", "其它盘符"],
    ["c:\\lower", "小写盘符"],
    ["\\\\server\\share", "UNC"],
    ["//server/share", "UNC 正斜杠"],
  ])("%s（%s）识别为 path", (target) => {
    expect(classifyOpenTarget(target)).toEqual({ kind: "path", value: target });
    expect(isUrlScheme(target)).toBe(false);
  });

  it("裸盘符 C: 也不是 scheme", () => {
    expect(isUrlScheme("C:")).toBe(false);
    expect(classifyOpenTarget("C:")).toEqual({ kind: "path", value: "C:" });
  });
});

describe("真正的 URL scheme", () => {
  it("http/https 交给浏览器", () => {
    expect(classifyOpenTarget("http://localhost:5173")).toEqual({
      kind: "http",
      value: "http://localhost:5173",
    });
    expect(classifyOpenTarget("HTTPS://example.com")).toEqual({
      kind: "http",
      value: "HTTPS://example.com",
    });
  });

  it.each(["file:///C:/Windows", "ms-msdt:/id", "mailto:a@b.c", "javascript:alert(1)"])(
    "%s 被拒绝",
    (target) => {
      expect(classifyOpenTarget(target).kind).toBe("unsupported");
    }
  );

  it("保留 scheme 名便于提示", () => {
    expect(classifyOpenTarget("file:///C:/Windows")).toEqual({
      kind: "unsupported",
      scheme: "file",
    });
  });
});

describe("边界输入", () => {
  it("空白串返回 empty", () => {
    expect(classifyOpenTarget("")).toEqual({ kind: "empty" });
    expect(classifyOpenTarget("   ")).toEqual({ kind: "empty" });
  });

  it("两端空白被裁剪", () => {
    expect(classifyOpenTarget("  C:\\proj  ")).toEqual({
      kind: "path",
      value: "C:\\proj",
    });
  });

  it("相对路径按 path 处理（由后端白名单决定是否放行）", () => {
    expect(classifyOpenTarget("proj/sub")).toEqual({ kind: "path", value: "proj/sub" });
  });
});
