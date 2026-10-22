import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import type { ThemeInput } from "./theme/tokens";
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from "./theme/presets";
import { DEFAULT_ORDER } from "./layout";

/**
 * store 里的主题 / 外壳 / 布局 / 组件摆放状态。
 *
 * 这些是全应用共享的偏好，任何一条回归都会让「用户选的东西重启后消失」，
 * 而单元测试之外（Playwright）只能覆盖到少数几条路径。
 */

function reset() {
  useStore.setState({
    theme: DEFAULT_THEME_ID,
    customThemes: [],
    shell: "rail",
    layout: "bento",
    widgetOrder: DEFAULT_ORDER,
    widgetHidden: [],
  });
  document.documentElement.dataset.theme = DEFAULT_THEME_ID;
  document.documentElement.dataset.shell = "rail";
  document.documentElement.dataset.layout = "bento";
}

const customTheme = (over: Partial<ThemeInput> = {}): ThemeInput => ({
  id: "custom-a",
  name: "Custom A",
  dark: true,
  bg: "#101010",
  panel: "#181818",
  text: "#f0f0f0",
  accent: "#ff8800",
  radiusCard: 8,
  radiusBtn: 6,
  density: "cozy",
  font: "sans",
  material: "line",
  grid: 0,
  panelOpacity: 1,
  builtin: false,
  ...over,
});

describe("主题状态", () => {
  beforeEach(reset);

  it("setTheme 切换内置主题并写入 dataset + CSS 变量", () => {
    useStore.getState().setTheme("frost");
    expect(useStore.getState().theme).toBe("frost");
    expect(document.documentElement.dataset.theme).toBe("frost");
    // 浅色主题的底色变量必须真的换了（而不是只改了个 id）
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-bg")
      .trim();
    expect(bg.toLowerCase()).toBe("#f2f4f7");
  });

  it("upsertTheme 新建自定义主题并立即生效", () => {
    const id = useStore.getState().upsertTheme(customTheme());
    expect(id).toBe("custom-a");
    expect(useStore.getState().customThemes).toHaveLength(1);
    expect(useStore.getState().theme).toBe("custom-a");
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim();
    expect(accent.toLowerCase()).toBe("#ff8800");
  });

  it("upsertTheme 同 id 覆盖而不是追加", () => {
    useStore.getState().upsertTheme(customTheme());
    useStore.getState().upsertTheme(customTheme({ accent: "#00ff00" }));
    expect(useStore.getState().customThemes).toHaveLength(1);
    expect(useStore.getState().customThemes[0].accent).toBe("#00ff00");
  });

  it("upsertTheme 传入 builtin 时不写自定义列表，只切换选中项", () => {
    // 内置主题随版本升级更新，用户副本不该覆盖它们；
    // 但「选中某套内置主题」是合法操作，必须真的切过去。
    const id = useStore.getState().upsertTheme({ ...BUILTIN_THEMES[0], builtin: true });
    expect(id).toBe(BUILTIN_THEMES[0].id);
    expect(useStore.getState().customThemes).toHaveLength(0);
    expect(useStore.getState().theme).toBe(BUILTIN_THEMES[0].id);
  });

  it("upsertTheme 传 builtin 但 id 未知时不制造悬空引用", () => {
    // 真实风险：theme 被设成一个在列表里不存在的 id，
    // tokensFor 回退第一套主题 → 界面与状态不一致。
    const id = useStore.getState().upsertTheme({
      ...BUILTIN_THEMES[0],
      id: "ghost",
      builtin: true,
    });
    expect(id).toBe("ghost");
    // 未匹配任何内置主题时回退默认，而不是留下悬空 id
    expect(useStore.getState().theme).toBe(DEFAULT_THEME_ID);
  });

  it("deleteTheme 删除自定义主题；若当前正在用它则回退默认主题", () => {
    useStore.getState().upsertTheme(customTheme());
    expect(useStore.getState().theme).toBe("custom-a");
    useStore.getState().deleteTheme("custom-a");
    expect(useStore.getState().customThemes).toHaveLength(0);
    expect(useStore.getState().theme).toBe(DEFAULT_THEME_ID);
  });

  it("deleteTheme 删除非当前主题时不影响当前选择", () => {
    useStore.getState().upsertTheme(customTheme({ id: "x", name: "X" }));
    useStore.getState().upsertTheme(customTheme({ id: "y", name: "Y" }));
    useStore.getState().setTheme("x");
    useStore.getState().deleteTheme("y");
    expect(useStore.getState().theme).toBe("x");
  });
});

describe("主题导入", () => {
  beforeEach(reset);

  it("合法 JSON 被接受并切到该主题", () => {
    const json = JSON.stringify({
      id: "imported",
      name: "Imported",
      bg: "#000000",
      panel: "#111111",
      text: "#ffffff",
      accent: "#123456",
    });
    const res = useStore.getState().importTheme(json);
    expect(res.ok).toBe(true);
    expect(res.id).toBe("imported");
    expect(useStore.getState().theme).toBe("imported");
  });

  it("非 JSON 返回错误而不是抛异常", () => {
    const res = useStore.getState().importTheme("not json {");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("缺字段的主题被拒绝", () => {
    const res = useStore.getState().importTheme(JSON.stringify({ id: "x", name: "X" }));
    expect(res.ok).toBe(false);
  });

  it("id 与内置主题冲突时自动改名，不覆盖内置主题", () => {
    const json = JSON.stringify({
      id: "midnight",
      name: "Hijack",
      bg: "#000000",
      panel: "#111111",
      text: "#ffffff",
      accent: "#123456",
    });
    const res = useStore.getState().importTheme(json);
    expect(res.ok).toBe(true);
    expect(res.id).not.toBe("midnight");
    // 内置主题本身没有被改写
    const builtinMidnight = BUILTIN_THEMES.find((t) => t.id === "midnight")!;
    const applied = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-bg")
      .trim();
    expect(applied.toLowerCase()).not.toBe(builtinMidnight.bg.toLowerCase());
  });
});

describe("外壳 / 布局 / 组件摆放", () => {
  beforeEach(reset);

  it("setShell 写入 dataset 且保留主题", () => {
    useStore.getState().setTheme("frost");
    useStore.getState().setShell("dock");
    expect(document.documentElement.dataset.shell).toBe("dock");
    expect(document.documentElement.dataset.theme).toBe("frost");
  });

  it("setLayout 写入 dataset（否则 CSS 与测试都读不到当前版面）", () => {
    useStore.getState().setLayout("orbit");
    expect(useStore.getState().layout).toBe("orbit");
    expect(document.documentElement.dataset.layout).toBe("orbit");
  });

  it("setWidgetOrder 清洗未知 id 并补齐缺失项", () => {
    useStore.getState().setWidgetOrder(["tasks", "bogus", "tasks"] as never);
    const order = useStore.getState().widgetOrder;
    expect(order[0]).toBe("tasks");
    expect(order).toHaveLength(DEFAULT_ORDER.length);
    expect(order).not.toContain("bogus");
  });

  it("setWidgetHidden 只保留已知 id", () => {
    useStore.getState().setWidgetHidden(["disks", "nope"] as never);
    expect(useStore.getState().widgetHidden).toEqual(["disks"]);
  });

  it("resetWidgets 恢复默认顺序并清空隐藏", () => {
    useStore.getState().setWidgetOrder(["tasks", ...DEFAULT_ORDER] as never);
    useStore.getState().setWidgetHidden(["disks"] as never);
    useStore.getState().resetWidgets();
    expect(useStore.getState().widgetOrder).toEqual(DEFAULT_ORDER);
    expect(useStore.getState().widgetHidden).toEqual([]);
  });
});
