/**
 * ECharts 按需引入封装。
 * - 仅注册实际用到的 Chart / Component，消除 ~800KB 体积
 * - 注册暗/亮双主题，图表选项不再硬编码颜色
 * - 包装为可直接替换 echarts-for-react 的组件
 *
 * 主题色板与图表选项构造器在 ./chartTheme（纯函数，独立模块便于热更新与单测）。
 */

import { useCallback, useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart, BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption as EChartsOption, EChartsType } from "echarts/core";
import { DARK, LIGHT, type ThemeName } from "./chartTheme";

// ─── 注册最小集合 ──────────────────────────────────────────
echarts.use([
  PieChart,
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

function toEChartsTheme(t: typeof DARK): echarts.EChartsCoreOption {
  return {
    color: [t.accent, "#a78bfa", t.ok, t.warn, t.danger, "#60a5fa"],
    backgroundColor: "transparent",
    textStyle: { color: t.text },
    tooltip: {
      backgroundColor: t.panel,
      borderColor: t.line,
      textStyle: { color: t.text },
    },
    legend: {
      textStyle: { color: t.dim },
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 4,
    },
    grid: {
      left: 36,
      right: 16,
      top: 16,
      bottom: 24,
      containLabel: true,
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: t.line } },
      axisTick: { lineStyle: { color: t.line } },
      axisLabel: { color: t.dim, fontSize: 10 },
      splitLine: { lineStyle: { color: t.line, type: "dashed" } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: t.line } },
      axisLabel: { color: t.dim, fontSize: 10 },
      splitLine: { lineStyle: { color: t.line, type: "dashed" } },
    },
  };
}

echarts.registerTheme("wb-dark", toEChartsTheme(DARK));
echarts.registerTheme("wb-light", toEChartsTheme(LIGHT));

/** 读取当前生效的主题名（与 store 的 theme 字段同源）。 */
function currentThemeName(): ThemeName {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// ─── 组件 ──────────────────────────────────────────────────

export interface EChartProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  notMerge?: boolean;
  lazyUpdate?: boolean;
  className?: string;
}

export function EChart({ option, style, notMerge, lazyUpdate, className }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  // 供主题切换的 observer 回放最新选项；在 effect 内同步以免渲染期写 ref
  const optionRef = useRef(option);

  const initChart = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    chartRef.current?.dispose();
    chartRef.current = echarts.init(node, `wb-${currentThemeName()}`, {
      renderer: "canvas",
    });
    chartRef.current.setOption(optionRef.current, {
      notMerge: true,
      lazyUpdate: false,
    });
    chartRef.current.resize();
  }, []);

  // 初始化
  useEffect(() => {
    initChart();
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);

    // 容器尺寸变化也要 resize：页面里有「高度随数据条数变化」的图表
    // （AI 内存图按进程数算高度），只监听 window resize 会让 canvas 停留在
    // 旧尺寸被拉伸。ResizeObserver 在 jsdom 里由 test/setup.ts 打桩。
    const observer = new ResizeObserver(onResize);
    if (ref.current) observer.observe(ref.current);

    return () => {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [initChart]);

  // 主题切换时按新主题重建实例并回放当前 option
  useEffect(() => {
    const obs = new MutationObserver(() => initChart());
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, [initChart]);

  // option 变更
  useEffect(() => {
    optionRef.current = option;
    chartRef.current?.setOption(option, { notMerge, lazyUpdate });
  }, [option, notMerge, lazyUpdate]);

  return <div ref={ref} style={style} className={className} />;
}
