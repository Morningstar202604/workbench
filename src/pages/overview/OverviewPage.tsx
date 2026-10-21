import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "../../lib/store";
import { useShallow } from "zustand/react/shallow";
import { useT, useLang, localeFor, type Lang } from "../../lib/i18n";
import { useBreakpoint } from "../../lib/useBreakpoint";
import { BrandMark } from "../../components/BrandMark";
import { orbitSlots, widgetOf, widgetsForLayout, type WidgetId } from "../../lib/layout";
import { Nameplate, OrbitTile } from "./widgets";
import { WIDGET_COMPONENTS } from "./registry";

/**
 * 概览页：只负责「按布局摆放组件」。
 *
 * 五种布局共享同一批组件，差异只在容器与流式规则：
 * - bento：12 栅格，组件按自身 span 占位；
 * - ledger：单列通栏，逐行扫读；
 * - orbit：以圆心仪表为轴，模块绕环分布（窄屏自动退化成列表）；
 * - dense：两列紧排，去掉装饰间距；
 * - zen：只留指标与主图。
 *
 * 为什么用 CSS grid + 少量内联定位而不是把布局也做成数据驱动引擎：
 * 组件宽度只有「占几列」这一维，栅格已经能表达；做一套通用布局 DSL
 * 会引入比收益大得多的复杂度，而且很难在窄屏上正确降级。
 */

export default function Overview() {
  const t = useT();
  const lang = useLang();
  const bp = useBreakpoint();
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const { layout, widgetOrder, widgetHidden, setWidgetOrder } = useStore(
    useShallow((s) => ({
      layout: s.layout,
      widgetOrder: s.widgetOrder,
      widgetHidden: s.widgetHidden,
      setWidgetOrder: s.setWidgetOrder,
    }))
  );

  const ids = useMemo(
    () => widgetsForLayout(layout, widgetOrder, widgetHidden),
    [layout, widgetOrder, widgetHidden]
  );

  const dropOn = (target: WidgetId) => {
    if (!dragging || dragging === target) return;
    const order = [...widgetOrder];
    const from = order.indexOf(dragging);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragging);
    setWidgetOrder(order);
    setDragging(null);
  };

  const handle = (id: WidgetId) => (
    <span
      draggable
      onDragStart={() => setDragging(id)}
      onDragEnd={() => setDragging(null)}
      title={t("overview.dragHint")}
      className="cursor-grab select-none rounded px-1 text-[10px] text-faint/60 hover:text-faint active:cursor-grabbing"
      aria-hidden="true"
    >
      ⠿
    </span>
  );

  const render = (id: WidgetId) => {
    const W = WIDGET_COMPONENTS[id];
    const body = W();
    // 拖拽把手叠在组件右上角：不改变组件自身的标题栏结构，
    // 也就不需要每个组件都知道「自己可拖动」。
    return (
      <div
        key={id}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => dropOn(id)}
        className={`group relative transition-opacity ${
          dragging === id ? "opacity-40" : ""
        }`}
      >
        <div className="absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          {handle(id)}
        </div>
        {body}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Masthead date={new Date()} lang={lang} />

      <Nameplate />

      {layout === "bento" && <Bento ids={ids} render={render} />}
      {layout === "dense" && <Dense ids={ids} render={render} />}
      {layout === "ledger" && <Ledger ids={ids} render={render} />}
      {layout === "orbit" && (
        <Orbit
          ids={ids}
          render={render}
          compact={bp === "compact"}
          kpis={WIDGET_COMPONENTS.kpis()}
        />
      )}
      {layout === "zen" && <Zen ids={ids} render={render} />}

      {ids.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line/80 px-4 py-10 text-center text-[12px] text-faint">
          {t("overview.allHidden")}
        </div>
      )}
    </div>
  );
}

function Masthead({ date, lang }: { date: Date; lang: Lang }) {
  const t = useT();
  return (
    <header className="flex flex-col gap-3 border-b border-line/70 pb-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <BrandMark className="h-6 w-[27px] shrink-0 sm:h-7 sm:w-8" gradient />
          <h1 className="t-heading truncate text-[26px] font-semibold leading-none sm:text-[30px]">
            {t("overview.heroTitle")}
          </h1>
          <span className="hidden text-[11px] font-medium tracking-[0.14em] text-faint sm:inline">
            WORKBENCH
          </span>
        </div>
        <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-dim">
          {greeting(t)}，{t("overview.heroSubtitle")}
        </p>
      </div>
      <div className="flex items-center gap-4 sm:ml-auto sm:flex-col sm:items-end sm:gap-1.5">
        <span className="flex items-center gap-2 text-[11px] font-medium text-ok">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ok" />
          </span>
          {t("overview.liveMonitoring")}
        </span>
        <span className="num text-[11px] text-faint">
          {date.toLocaleDateString(localeFor(lang), {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
      </div>
    </header>
  );
}

type Renderer = (id: WidgetId) => ReactNode;

function Bento({ ids, render }: { ids: WidgetId[]; render: Renderer }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {ids.map((id) => {
        const w = widgetOf(id);
        return (
          <div
            key={id}
            className={
              w.span >= 12
                ? "lg:col-span-12"
                : w.span >= 8
                  ? "lg:col-span-8"
                  : w.span >= 6
                    ? "lg:col-span-6"
                    : w.span >= 4
                      ? "lg:col-span-4"
                      : "lg:col-span-3"
            }
          >
            {render(id)}
          </div>
        );
      })}
    </div>
  );
}

function Dense({ ids, render }: { ids: WidgetId[]; render: Renderer }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
      {ids.map((id) => (
        <div key={id} className={id === "kpis" ? "xl:col-span-2" : ""}>
          {render(id)}
        </div>
      ))}
    </div>
  );
}

function Ledger({ ids, render }: { ids: WidgetId[]; render: Renderer }) {
  // 单列通栏：`resources` 这种图表仍然给固定高度，其余按内容自适应。
  return (
    <div className="flex flex-col gap-2.5">
      {ids.map((id) => (
        <div key={id} className={id === "resources" ? "min-h-[260px]" : ""}>
          {render(id)}
        </div>
      ))}
    </div>
  );
}

function Zen({ ids, render }: { ids: WidgetId[]; render: Renderer }) {
  return (
    <div className="flex flex-col gap-5">
      {ids.map((id) => (
        <div key={id} className={id === "resources" ? "min-h-[320px]" : ""}>
          {render(id)}
        </div>
      ))}
    </div>
  );
}

/**
 * 环形布局。
 *
 * 太极的原始意象是「阴阳两鱼互抱」，直接照搬会把卡片扭成弧形、文字跟着转，
 * 在高密度工具里立刻不可读。这里保留的是它的结构：**一个圆心 + 一圈卫星**。
 * 圆心是指标盘（太极的「眼」），卫星是各模块。
 *
 * 窄屏（<768）整体退化成单列：环形在 390px 宽度下每个卫星只剩 80px。
 */
function Orbit({
  ids,
  render,
  compact,
  kpis,
}: {
  ids: WidgetId[];
  render: Renderer;
  compact: boolean;
  kpis: ReactNode;
}) {
  const satellites = ids.filter((id) => id !== "kpis");
  const slots = orbitSlots(satellites, satellites.length);

  if (compact) {
    return (
      <div className="flex flex-col gap-3">
        {kpis}
        {satellites.map((id) => (
          <div key={id}>{render(id)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {kpis}
      <div className="relative mx-auto w-full max-w-[1180px]">
        {/* 高度按卫星数量增长：4 个时 520px，8 个时 720px */}
        <div
          className="relative"
          style={{ height: Math.min(860, 460 + satellites.length * 34) }}
        >
          {/* 环：只有一条 1px 虚线圈，不铺渐变、不加动画 */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line/70"
            style={{ width: "62%", aspectRatio: "1 / 1" }}
            aria-hidden="true"
          />
          {/* 圆心：主指标盘 */}
          <div className="absolute left-1/2 top-1/2 z-10 w-[168px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-panel p-1 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.8)]">
            <HubGauge />
          </div>

          {slots.map((slot) => (
            <div
              key={slot.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${slot.x * 100}%`,
                top: `${slot.y * 100}%`,
                width: `min(232px, ${slot.width * 100}%)`,
              }}
            >
              <OrbitTile id={slot.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 圆心仪表：CPU 环形进度 + 三个小读数。 */
function HubGauge() {
  const t = useT();
  const { procs, devs, ais } = useStore(
    useShallow((s) => ({ procs: s.procs, devs: s.devs, ais: s.ais }))
  );
  const cpu = procs.reduce((a, p) => a + (p.cpu ?? 0), 0);
  const pct = Math.min(100, Math.round(cpu));
  const r = 52;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex aspect-square flex-col items-center justify-center rounded-full text-center">
      <svg viewBox="0 0 120 120" className="absolute h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="4"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="num relative text-[26px] font-semibold leading-none text-text">
        {pct}
        <span className="text-[12px] text-dim">%</span>
      </span>
      <span className="relative mt-1 text-[9.5px] tracking-[0.1em] text-faint">
        {t("overview.hubCpu")}
      </span>
      <div className="relative mt-2 flex gap-2.5 text-[9.5px] text-dim">
        <span>
          {procs.length}
          <span className="ml-0.5 text-faint">{t("overview.hubProc")}</span>
        </span>
        <span>
          {devs.length}
          <span className="ml-0.5 text-faint">{t("overview.hubSrv")}</span>
        </span>
        <span>
          {ais.length}
          <span className="ml-0.5 text-faint">{t("overview.hubAi")}</span>
        </span>
      </div>
    </div>
  );
}

/** 按当前小时返回问候语。 */
function greeting(t: (key: string) => string): string {
  const h = new Date().getHours();
  if (h < 5) return t("overview.greeting.lateNight");
  if (h < 11) return t("overview.greeting.morning");
  if (h < 14) return t("overview.greeting.noon");
  if (h < 18) return t("overview.greeting.afternoon");
  return t("overview.greeting.evening");
}
