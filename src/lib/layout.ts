/**
 * 版面系统：外壳（shell）× 概览页布局（layout）× 组件摆放（widget order）。
 *
 * 为什么单独成模块：之前「主题」只换颜色，布局永远是同一套三段式。
 * 现在把「外壳怎么排」和「页面里组件怎么摆」也变成数据，用户能选、能拖、能存。
 *
 * 三类东西分开的原因：
 * - shell 影响全局骨架（导航在哪、内容占多宽），换它等于换一个应用形态；
 * - layout 只影响概览页的编排方式（网格 / 长条 / 环形 / 极简 / 密排）；
 * - widget order 是用户对「自己关心什么」的排序，与上面两者正交。
 * 混成一个「主题」会导致：想换个配色，结果版面也被重置。
 */

export type ShellId = "rail" | "dock" | "zen";

export type OverviewLayoutId =
  "bento" | "ledger" | "orbit" | "zen" | "dense" | "timeline" | "board";

export interface ShellDef {
  id: ShellId;
  name: Record<"en" | "zh" | "ja", string>;
  hint: Record<"en" | "zh" | "ja", string>;
}

export const SHELLS: ShellDef[] = [
  {
    id: "rail",
    name: { en: "Rail", zh: "侧栏", ja: "レール" },
    hint: {
      en: "Classic left rail, content owns the rest of the window",
      zh: "经典左侧栏，内容占满其余宽度",
      ja: "左レール、残りはコンテンツ",
    },
  },
  {
    id: "dock",
    name: { en: "Dock", zh: "顶部坞", ja: "ドック" },
    hint: {
      en: "Navigation moves to a top dock: full-width canvas, more room for wide charts",
      zh: "导航收进顶部坞：画布全宽，横向图表能拿到更多空间",
      ja: "ナビを上部ドックへ。全幅キャンバス",
    },
  },
  {
    id: "zen",
    name: { en: "Zen", zh: "专注", ja: "ゼン" },
    hint: {
      en: "Rail collapses to a strip of icons; one centred column, no side chrome",
      zh: "侧栏压成图标条，内容单列居中，去掉一切侧边装饰",
      ja: "アイコン列のみ、中央 1 カラム",
    },
  },
];

export interface LayoutDef {
  id: OverviewLayoutId;
  name: Record<"en" | "zh" | "ja", string>;
  hint: Record<"en" | "zh" | "ja", string>;
}

export const LAYOUTS: LayoutDef[] = [
  {
    id: "bento",
    name: { en: "Bento", zh: "便当格", ja: "弁当" },
    hint: {
      en: "Mixed-size grid: 4 KPIs, a wide chart, two half-width panels",
      zh: "大小格混排：4 个指标 + 一张宽图 + 两个半宽面板",
      ja: "大小混在のグリッド",
    },
  },
  {
    id: "ledger",
    name: { en: "Ledger", zh: "账本", ja: "台帳" },
    hint: {
      en: "One column of full-width rows, numbers aligned in a left rail — best for scanning",
      zh: "单列通栏行，数值对齐在左侧栏位——最适合逐行扫读",
      ja: "1 カラムの全幅行、数値を左に整列",
    },
  },
  {
    id: "orbit",
    name: { en: "Orbit", zh: "环仪", ja: "オービット" },
    hint: {
      en: "Modules orbit a central gauge: the yin-yang idea, but readable — the hub carries the headline number",
      zh: "模块绕中心仪表环排布：太极的思路，但保证可读——圆心承载主指标",
      ja: "中央ゲージの周囲にモジュールを配置",
    },
  },
  {
    id: "dense",
    name: { en: "Dense", zh: "密排", ja: "密" },
    hint: {
      en: "Two tight columns, no decorative padding — maximum information per screen",
      zh: "两列紧排，去掉装饰性留白——单屏信息量优先",
      ja: "2 列密排、余白最小",
    },
  },
  {
    id: "zen",
    name: { en: "Zen", zh: "极简", ja: "禅" },
    hint: {
      en: "Four numbers and one chart; everything else rests until asked for",
      zh: "四个数字 + 一张图；其余内容不打扰",
      ja: "数字 4 つとグラフ 1 枚だけ",
    },
  },
  {
    id: "timeline",
    name: { en: "Timeline", zh: "时间轴", ja: "タイムライン" },
    hint: {
      en: "Each widget is a numbered stop on one vertical rail, top to bottom in your order",
      zh: "每个组件是竖向轨道上的一站，带序号，按你的排序自上而下",
      ja: "各ウィジェットを番号付きの縦レールに順に配置",
    },
  },
  {
    id: "board",
    name: { en: "Board", zh: "看板", ja: "ボード" },
    hint: {
      en: "Three fixed lanes — signals, resources, work — grouped by purpose; your order kept within each lane",
      zh: "固定三列：信号、资源、工作，按用途分组（列内仍按你的排序）",
      ja: "3 つの固定レーン（状態 / リソース / 作業）に目的別に配置。列内はあなたの順序",
    },
  },
];

/**
 * 概览页的可摆放组件。
 *
 * `span` 是它在 bento 网格里占的列数（12 栅格），也是 dense/orbit 分配的权重。
 * 组件本身不感知布局——页面按 id 渲染，摆放逻辑集中在 Overview。
 */
export type WidgetId =
  | "kpis"
  | "resources"
  | "categories"
  | "disks"
  | "ports"
  | "processes"
  | "services"
  | "tasks"
  | "sessions";

export interface WidgetDef {
  id: WidgetId;
  name: Record<"en" | "zh" | "ja", string>;
  /** bento 栅格宽度（12 列制） */
  span: number;
  /** 高度档：1 = 紧凑（约 180px），2 = 标准（约 300px） */
  tall: 1 | 2;
}

export const WIDGETS: WidgetDef[] = [
  {
    id: "kpis",
    name: { en: "Key figures", zh: "关键指标", ja: "主要指標" },
    span: 12,
    tall: 1,
  },
  {
    id: "resources",
    name: { en: "Resource curve", zh: "资源曲线", ja: "リソース推移" },
    span: 8,
    tall: 2,
  },
  {
    id: "categories",
    name: { en: "Process mix", zh: "进程分类", ja: "プロセス分類" },
    span: 4,
    tall: 2,
  },
  { id: "disks", name: { en: "Disks", zh: "磁盘", ja: "ディスク" }, span: 6, tall: 2 },
  { id: "ports", name: { en: "Ports", zh: "端口", ja: "ポート" }, span: 6, tall: 2 },
  {
    id: "processes",
    name: { en: "Top processes", zh: "CPU 前列", ja: "CPU 上位" },
    span: 6,
    tall: 2,
  },
  {
    id: "services",
    name: { en: "Services", zh: "运行服务", ja: "稼働サービス" },
    span: 6,
    tall: 2,
  },
  {
    id: "tasks",
    name: { en: "Due tasks", zh: "临期任务", ja: "期限タスク" },
    span: 6,
    tall: 2,
  },
  {
    id: "sessions",
    name: { en: "Session files", zh: "会话文件", ja: "セッション" },
    span: 6,
    tall: 2,
  },
];

export const DEFAULT_ORDER: WidgetId[] = WIDGETS.map((w) => w.id);

export function widgetOf(id: WidgetId): WidgetDef {
  return WIDGETS.find((w) => w.id === id) ?? WIDGETS[0];
}

/** 极简布局只留这几块，其余暂时收起（不删除用户的排序与可见性）。 */
export const ZEN_WIDGETS: WidgetId[] = ["kpis", "resources"];

/** 每种布局给哪些组件位置；未列出的组件在该布局下不渲染。 */
export function widgetsForLayout(
  layout: OverviewLayoutId,
  order: WidgetId[],
  hidden: WidgetId[]
): WidgetId[] {
  const visible = order.filter((id) => !hidden.includes(id));
  if (layout === "zen") return ZEN_WIDGETS.filter((id) => visible.includes(id));
  return visible;
}

/** 校验来自 localStorage / 导入文件的排序：去重、只留已知 id、补齐缺失项。 */
export function normalizeOrder(raw: unknown): WidgetId[] {
  const known = new Set<string>(WIDGETS.map((w) => w.id));
  const out: WidgetId[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && known.has(v) && !out.includes(v as WidgetId)) {
        out.push(v as WidgetId);
      }
    }
  }
  for (const id of DEFAULT_ORDER) if (!out.includes(id)) out.push(id);
  return out;
}

export function normalizeHidden(raw: unknown): WidgetId[] {
  const known = new Set<string>(WIDGETS.map((w) => w.id));
  if (!Array.isArray(raw)) return [];
  const out: WidgetId[] = [];
  for (const v of raw) {
    if (typeof v === "string" && known.has(v) && !out.includes(v as WidgetId)) {
      out.push(v as WidgetId);
    }
  }
  return out;
}

/** 用户可选的组件宽度档位（12 栅格制）。 */
export const SPAN_OPTIONS = [4, 6, 8, 12] as const;
export type WidgetSpan = (typeof SPAN_OPTIONS)[number];

/**
 * 组件宽度覆盖表。缺省（没有这个 id）= 用组件自带的 span。
 *
 * 为什么是覆盖而不是完整表：组件增删时（版本升级加了新组件），
 * 完整表会缺键，界面就只剩默认值；覆盖表天然向后兼容。
 */
export function normalizeSpans(raw: unknown): Partial<Record<WidgetId, number>> {
  const known = new Set<string>(WIDGETS.map((w) => w.id));
  const out: Partial<Record<WidgetId, number>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(k)) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const snapped = SPAN_OPTIONS.reduce((best, opt) =>
      Math.abs(opt - v) < Math.abs(best - v) ? opt : best
    );
    out[k as WidgetId] = snapped;
  }
  return out;
}

/** 某个组件在给定覆盖表下的实际栅格宽度。 */
export function spanOf(
  id: WidgetId,
  overrides: Partial<Record<WidgetId, number>>
): number {
  return overrides[id] ?? widgetOf(id).span;
}

export function normalizeShell(raw: unknown): ShellId {
  if (raw === "dock" || raw === "zen" || raw === "rail") return raw;
  return "rail";
}

export function normalizeLayout(raw: unknown): OverviewLayoutId {
  if (
    raw === "ledger" ||
    raw === "orbit" ||
    raw === "zen" ||
    raw === "dense" ||
    raw === "timeline" ||
    raw === "board" ||
    raw === "bento"
  ) {
    return raw;
  }
  return "bento";
}

/**
 * 看板布局的固定三列：按组件「是干什么的」分组，而不是按用户全局排序
 * 硬拆——看板的价值就在于同类的站在一起。列内仍然遵守用户排序，
 * 隐藏的组件照常不出现，空列在渲染层被丢弃。
 */
export type BoardLaneId = "signals" | "resources" | "work";

export const BOARD_LANES: { id: BoardLaneId; widgets: WidgetId[] }[] = [
  { id: "signals", widgets: ["kpis", "resources", "categories"] },
  { id: "resources", widgets: ["disks", "ports", "processes"] },
  { id: "work", widgets: ["services", "tasks", "sessions"] },
];

/** 把（已过滤可见性的）组件列表分进三列；空列不返回。 */
export function boardLanes(ids: WidgetId[]): { id: BoardLaneId; widgets: WidgetId[] }[] {
  // 按 ids（用户顺序）分桶，而不是按 BOARD_LANES 过滤——否则列内顺序
  // 变成注册表顺序，「列内仍按你的排序」就是一句假话。
  const laneOf = new Map<WidgetId, BoardLaneId>();
  for (const lane of BOARD_LANES) {
    for (const w of lane.widgets) laneOf.set(w, lane.id);
  }
  const buckets = new Map<BoardLaneId, WidgetId[]>();
  for (const id of ids) {
    const lane = laneOf.get(id);
    if (!lane) continue;
    const bucket = buckets.get(lane);
    if (bucket) bucket.push(id);
    else buckets.set(lane, [id]);
  }
  return BOARD_LANES.filter((lane) => buckets.has(lane.id)).map((lane) => ({
    id: lane.id,
    widgets: buckets.get(lane.id)!,
  }));
}

/**
 * 环形布局的坐标。
 *
 * 不用 CSS grid 硬凑圆形：需要的是「绕中心均匀分布 + 半径随容器变化」，
 * 一行三角函数比十几种断点类更直观，也更容易在窄屏整体退化成列表。
 * 返回百分比坐标，交给绝对定位。
 */
export interface OrbitSlot {
  id: WidgetId;
  /** 0..1，相对容器宽高 */
  x: number;
  y: number;
  /** 卡片宽度占比 */
  width: number;
}

export function orbitSlots(ids: WidgetId[], count: number): OrbitSlot[] {
  const n = Math.max(1, count);
  const radius = 0.34;
  return ids.map((id, i) => {
    // 从正上方开始顺时针；10 点时避开圆心正上方的标题区
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return {
      id,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius * 0.92,
      width: n <= 4 ? 0.3 : n <= 6 ? 0.26 : 0.22,
    };
  });
}
