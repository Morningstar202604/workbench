import { describe, expect, it } from "vitest";
import {
  BUILTIN_THEMES,
  allThemes,
  deriveTheme,
  findTheme,
  migrateThemeId,
  parseTheme,
  swatchOf,
  tokensFor,
} from "./presets";

describe("内置主题", () => {
  it("id 唯一，且都标了 builtin", () => {
    const ids = BUILTIN_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of BUILTIN_THEMES) expect(t.builtin).toBe(true);
  });

  it("每套内置主题都能被 buildTheme 展开", () => {
    for (const t of BUILTIN_THEMES) {
      const tokens = tokensFor(t.id, []);
      expect(tokens.vars["--color-bg"]).toBeTruthy();
      expect(tokens.chart.series.length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("parseTheme", () => {
  const good = {
    id: "x",
    name: "X",
    bg: "#111111",
    panel: "#222222",
    text: "#eeeeee",
    accent: "#ff0000",
  };

  it("接受最小合法主题并补齐默认值", () => {
    const t = parseTheme(good)!;
    expect(t).not.toBeNull();
    expect(t.radiusCard).toBe(10);
    expect(t.density).toBe("cozy");
    expect(t.font).toBe("sans");
    expect(t.material).toBe("line");
    expect(t.builtin).toBe(false);
  });

  it("缺字段或颜色非法时返回 null（fail-closed）", () => {
    expect(parseTheme({ ...good, accent: undefined })).toBeNull();
    expect(parseTheme({ ...good, bg: "red" })).toBeNull();
    expect(parseTheme({ ...good, id: "  " })).toBeNull();
    expect(parseTheme("nope")).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });

  it("越界的数值被夹到合法区间而不是丢弃", () => {
    const t = parseTheme({ ...good, radiusCard: 999, grid: -5, panelOpacity: 99 })!;
    expect(t.radiusCard).toBe(40);
    expect(t.grid).toBe(0);
    expect(t.panelOpacity).toBe(1);
  });

  it("未知的枚举措辞回退默认值", () => {
    const t = parseTheme({ ...good, density: "weird", font: "comic", material: "wood" })!;
    expect(t.density).toBe("cozy");
    expect(t.font).toBe("sans");
    expect(t.material).toBe("line");
  });

  it("未给 dark 时按底色亮度推断", () => {
    expect(parseTheme({ ...good, bg: "#ffffff", panel: "#ffffff" })!.dark).toBe(false);
    expect(parseTheme({ ...good, bg: "#000000", panel: "#000000" })!.dark).toBe(true);
  });
});

describe("主题列表与迁移", () => {
  it("自定义主题追加在内置之后，且 builtin 被强制为 false", () => {
    const custom = [{ ...BUILTIN_THEMES[0], id: "mine", name: "Mine", builtin: true }];
    const list = allThemes(custom);
    expect(list.length).toBe(BUILTIN_THEMES.length + 1);
    expect(list[list.length - 1].builtin).toBe(false);
  });

  it("findTheme 找不到时回退第一套内置", () => {
    expect(findTheme("does-not-exist", []).id).toBe(BUILTIN_THEMES[0].id);
  });

  it("migrateThemeId 映射旧的 dark/light 并保留已知 id", () => {
    expect(migrateThemeId("dark", BUILTIN_THEMES)).toBe("midnight");
    expect(migrateThemeId("light", BUILTIN_THEMES)).toBe("frost");
    expect(migrateThemeId("aurora", BUILTIN_THEMES)).toBe("aurora");
    expect(migrateThemeId("deleted-custom", BUILTIN_THEMES)).toBe("midnight");
    expect(migrateThemeId(42, BUILTIN_THEMES)).toBe("midnight");
  });

  it("deriveTheme 产出可编辑副本", () => {
    const copy = deriveTheme(BUILTIN_THEMES[0], "Copy", "copy-1");
    expect(copy.id).toBe("copy-1");
    expect(copy.name).toBe("Copy");
    expect(copy.builtin).toBe(false);
    expect(copy.bg).toBe(BUILTIN_THEMES[0].bg);
  });

  it("swatchOf 返回底/面板/强调/文字四色", () => {
    expect(swatchOf(BUILTIN_THEMES[0])).toEqual([
      BUILTIN_THEMES[0].bg,
      BUILTIN_THEMES[0].panel,
      BUILTIN_THEMES[0].accent,
      BUILTIN_THEMES[0].text,
    ]);
  });
});
