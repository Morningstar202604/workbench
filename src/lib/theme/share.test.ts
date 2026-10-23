import { describe, expect, it } from "vitest";
import { BUILTIN_THEMES } from "./presets";
import type { ThemeInput } from "./tokens";
import { buildShareUrl, consumeThemeHash, decodeTheme, encodeTheme } from "./share";

const good: ThemeInput = {
  id: "custom-test",
  name: "苔玉 #1",
  dark: true,
  bg: "#07080b",
  panel: "#0c0f15",
  text: "#e8ecf2",
  accent: "#22d3ee",
  radiusCard: 10,
  radiusBtn: 7,
  density: "cozy",
  font: "sans",
  material: "line",
  grid: 1,
  panelOpacity: 1,
};

describe("encodeTheme / decodeTheme", () => {
  it("往返无损（含中文名）", () => {
    const back = decodeTheme(encodeTheme(good));
    expect(back).not.toBeNull();
    expect(back!.id).toBe(good.id);
    expect(back!.name).toBe(good.name);
    expect(back!.accent).toBe(good.accent);
    expect(back!.radiusCard).toBe(good.radiusCard);
    expect(back!.grid).toBe(good.grid);
    expect(back!.panelOpacity).toBe(good.panelOpacity);
  });

  it("八套内置主题全部可往返", () => {
    for (const t of BUILTIN_THEMES) {
      const back = decodeTheme(encodeTheme(t));
      expect(back?.id).toBe(t.id);
      expect(back?.name).toBe(t.name);
    }
  });

  it("编码只含 URL 安全字符，无填充符", () => {
    const enc = encodeTheme(good);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(enc).not.toContain("=");
    expect(enc).not.toContain("+");
    expect(enc).not.toContain("/");
  });

  it("解码失败一律返回 null（fail-closed）", () => {
    expect(decodeTheme("")).toBeNull();
    expect(decodeTheme("!!!!not-base64!!!!")).toBeNull();
    // 合法 base64，但内容不是 JSON
    expect(decodeTheme(btoa("this is not json"))).toBeNull();
    // 合法 JSON，但缺必填字段
    expect(decodeTheme(encodeTheme({} as ThemeInput))).toBeNull();
    // 颜色不是合法 hex
    expect(decodeTheme(encodeTheme({ ...good, bg: "red" }))).toBeNull();
  });
});

describe("buildShareUrl", () => {
  it("拼上 #theme= 参数并落在给定页面上", () => {
    const url = buildShareUrl(good, { origin: "https://wb.example", pathname: "/app/" });
    expect(url.startsWith("https://wb.example/app/#theme=")).toBe(true);
    const payload = url.split("#theme=")[1];
    expect(decodeTheme(payload)?.id).toBe(good.id);
  });

  it("缺省时使用当前页面的 origin 与 pathname", () => {
    const url = buildShareUrl(good);
    expect(url).toMatch(/^http:\/\/localhost(:\d+)?\/#theme=/);
    const payload = url.split("#theme=")[1];
    expect(decodeTheme(payload)?.id).toBe(good.id);
  });
});

describe("consumeThemeHash", () => {
  it("有效参数：返回主题并清掉 hash（刷新不会重复导入）", () => {
    window.location.hash = `#theme=${encodeTheme(good)}`;
    const th = consumeThemeHash();
    expect(th?.id).toBe(good.id);
    expect(window.location.hash).toBe("");
    // 第二次调用：hash 已消费，返回 null
    expect(consumeThemeHash()).toBeNull();
  });

  it("非法载荷：返回 null，hash 同样被清掉", () => {
    window.location.hash = "#theme=%%%%broken%%%%";
    expect(consumeThemeHash()).toBeNull();
    expect(window.location.hash).toBe("");
  });

  it("非主题 hash 不动它", () => {
    window.location.hash = "#other=1";
    expect(consumeThemeHash()).toBeNull();
    expect(window.location.hash).toBe("#other=1");
    window.location.hash = "";
  });
});
