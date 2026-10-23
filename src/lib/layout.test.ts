import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORDER,
  LAYOUTS,
  SHELLS,
  WIDGETS,
  ZEN_WIDGETS,
  boardLanes,
  normalizeHidden,
  normalizeLayout,
  normalizeOrder,
  normalizeShell,
  orbitSlots,
  widgetOf,
  widgetsForLayout,
} from "./layout";

describe("注册表", () => {
  it("组件 id 唯一，span 在 1..12", () => {
    const ids = WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WIDGETS) {
      expect(w.span).toBeGreaterThan(0);
      expect(w.span).toBeLessThanOrEqual(12);
    }
  });

  it("外壳与布局 id 唯一且非空", () => {
    expect(new Set(SHELLS.map((s) => s.id)).size).toBe(SHELLS.length);
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length);
    for (const l of LAYOUTS) {
      for (const lang of ["en", "zh", "ja"] as const) {
        expect(l.name[lang]).toBeTruthy();
        expect(l.hint[lang]).toBeTruthy();
      }
    }
  });
});

describe("normalizeOrder", () => {
  it("无输入时返回默认顺序", () => {
    expect(normalizeOrder(undefined)).toEqual(DEFAULT_ORDER);
    expect(normalizeOrder(null)).toEqual(DEFAULT_ORDER);
  });

  it("去掉未知 id 与重复项，并补齐缺失项", () => {
    const out = normalizeOrder(["tasks", "tasks", "nope", "kpis"]);
    expect(out[0]).toBe("tasks");
    expect(out[1]).toBe("kpis");
    expect(out.length).toBe(DEFAULT_ORDER.length);
    expect(new Set(out).size).toBe(DEFAULT_ORDER.length);
  });

  it("非数组输入回退默认", () => {
    expect(normalizeOrder("kpis")).toEqual(DEFAULT_ORDER);
    expect(normalizeOrder({ a: 1 })).toEqual(DEFAULT_ORDER);
  });
});

describe("normalizeHidden", () => {
  it("只保留已知 id，去重", () => {
    expect(normalizeHidden(["disks", "disks", "bogus"])).toEqual(["disks"]);
    expect(normalizeHidden("nope")).toEqual([]);
    expect(normalizeHidden(null)).toEqual([]);
  });
});

describe("normalizeShell / normalizeLayout", () => {
  it("已知值原样返回，未知值回退默认", () => {
    expect(normalizeShell("dock")).toBe("dock");
    expect(normalizeShell("zen")).toBe("zen");
    expect(normalizeShell("floating")).toBe("rail");
    expect(normalizeLayout("orbit")).toBe("orbit");
    expect(normalizeLayout("ledger")).toBe("ledger");
    expect(normalizeLayout("circle")).toBe("bento");
  });

  it("新增版面 timeline / board 可被接受，旧值不受影响", () => {
    expect(normalizeLayout("timeline")).toBe("timeline");
    expect(normalizeLayout("board")).toBe("board");
    expect(LAYOUTS.map((l) => l.id)).toContain("timeline");
    expect(LAYOUTS.map((l) => l.id)).toContain("board");
  });
});

describe("widgetsForLayout（timeline）", () => {
  it("时间轴返回全部可见组件且保持用户顺序", () => {
    const order = ["kpis", "tasks", "disks", "ports"] as const;
    expect(widgetsForLayout("timeline", [...order], [])).toEqual([...order]);
  });

  it("隐藏的组件被过滤", () => {
    const out = widgetsForLayout("timeline", DEFAULT_ORDER, ["disks", "ports"]);
    expect(out).not.toContain("disks");
    expect(out).not.toContain("ports");
    expect(out.length).toBe(DEFAULT_ORDER.length - 2);
  });
});

describe("boardLanes", () => {
  it("按固定三列分组：信号 / 资源 / 工作", () => {
    const lanes = boardLanes(DEFAULT_ORDER);
    expect(lanes.map((l) => l.id)).toEqual(["signals", "resources", "work"]);
    expect(lanes[0].widgets).toEqual(["kpis", "resources", "categories"]);
    expect(lanes[1].widgets).toEqual(["disks", "ports", "processes"]);
    expect(lanes[2].widgets).toEqual(["services", "tasks", "sessions"]);
  });

  it("只包含可见组件，列内保持用户顺序，空列被丢弃", () => {
    const lanes = boardLanes(["tasks", "ports", "kpis"]);
    expect(lanes).toEqual([
      { id: "signals", widgets: ["kpis"] },
      { id: "resources", widgets: ["ports"] },
      { id: "work", widgets: ["tasks"] },
    ]);
  });

  it("同一列内的多个组件遵守用户排序（不是注册表顺序）", () => {
    const lanes = boardLanes(["sessions", "services", "kpis", "categories"]);
    expect(lanes).toEqual([
      { id: "signals", widgets: ["kpis", "categories"] },
      { id: "work", widgets: ["sessions", "services"] },
    ]);
  });

  it("全部隐藏时返回空数组，不抛异常", () => {
    expect(boardLanes([])).toEqual([]);
  });

  it("未知 id 不会出现在任何一列", () => {
    const lanes = boardLanes(["bogus" as never]);
    expect(lanes).toEqual([]);
  });
});

describe("widgetsForLayout", () => {
  const order = DEFAULT_ORDER;

  it("bento 返回全部可见组件且保持顺序", () => {
    expect(widgetsForLayout("bento", order, [])).toEqual(order);
  });

  it("隐藏的组件被过滤", () => {
    const out = widgetsForLayout("bento", order, ["disks", "ports"]);
    expect(out).not.toContain("disks");
    expect(out).not.toContain("ports");
    expect(out.length).toBe(order.length - 2);
  });

  it("zen 只留指标与主图（即使它们被隐藏也不硬塞回来）", () => {
    expect(widgetsForLayout("zen", order, [])).toEqual(ZEN_WIDGETS);
    expect(widgetsForLayout("zen", order, ["resources"])).toEqual(["kpis"]);
  });

  it("隐藏顺序与组件顺序无关", () => {
    const reversed = [...order].reverse();
    const out = widgetsForLayout("bento", reversed, []);
    expect(out).toEqual(reversed);
  });
});

describe("orbitSlots", () => {
  it("均匀分布：点到圆心距离相同，角度不同", () => {
    const ids = DEFAULT_ORDER.slice(0, 6);
    const slots = orbitSlots(ids, 6);
    expect(slots.length).toBe(6);
    const radii = slots.map((s) => Math.hypot(s.x - 0.5, (s.y - 0.5) / 0.92));
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 6);
    // 相邻点不重合
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].x === slots[i - 1].x && slots[i].y === slots[i - 1].y).toBe(false);
    }
  });

  it("第一个点位于正上方", () => {
    const [first] = orbitSlots(["kpis"], 1);
    expect(first.x).toBeCloseTo(0.5, 6);
    expect(first.y).toBeLessThan(0.5);
  });

  it("组件越多宽度越小，但不会退化成 0", () => {
    const few = orbitSlots(["a", "b"] as never, 2)[0].width;
    const many = orbitSlots(new Array(9).fill("a") as never, 9)[0].width;
    expect(many).toBeLessThan(few);
    expect(many).toBeGreaterThan(0.15);
  });

  it("数量为 0 时不抛异常", () => {
    expect(() => orbitSlots([], 0)).not.toThrow();
    expect(orbitSlots([], 0)).toEqual([]);
  });
});

describe("widgetOf", () => {
  it("未知 id 回退第一个组件而不是 undefined", () => {
    expect(widgetOf("nope" as never).id).toBe(WIDGETS[0].id);
  });
});
