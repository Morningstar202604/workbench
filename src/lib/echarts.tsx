/**
 * ECharts 按需引入封装。
 * - 仅注册实际用到的 Chart / Component，消除 ~800KB 体积
 * - 注册暗/亮双主题，图表选项不再硬编码颜色
 * - 包装为可直接替换 echarts-for-react 的组件
 */

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart, BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption as EChartsOption, EChartsType } from "echarts/core";

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

// ─── 主题定义（与 global.css 的 @theme 同步） ─────────────
interface ChartTheme {
  bg: string;
  panel: string;
  line: string;
  text: string;
  dim: string;
  accent: string;
  accentSoft: string;
  ok: string;
  warn: string;
  danger: string;
}

const DARK: ChartTheme = {
  bg: "#0a0f1c",
  panel: "#121a2b",
  line: "#22304a",
  text: "#e6edf7",
  dim: "#8b98ad",
  accent: "#22d3ee",
  accentSoft: "#16323d",
  ok: "#34d399",
  warn: "#fbbf24",
  danger: "#f87171",
};

const LIGHT: ChartTheme = {
  bg: "#eef2f8",
  panel: "#ffffff",
  line: "#d8e1ee",
  text: "#17233a",
  dim: "#5d6c85",
  accent: "#0e7490",
  accentSoft: "#d9f1f7",
  ok: "#047857",
  warn: "#b45309",
  danger: "#dc2626",
};

function toEChartsTheme(t: ChartTheme): echarts.EChartsCoreOption {
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

/** 返回当前主题下图表「间隙」应使用的颜色（即面板背景色）。 */
export function chartGapColor(): string {
  if (typeof document === "undefined") return DARK.bg;
  return document.documentElement.dataset.theme === "light" ? LIGHT.bg : DARK.bg;
}

/** 返回当前主题下的分隔线颜色（用于空数据占位图元）。
 * 注意：ECharts 不解析 CSS 变量，选项里必须给出真实色值。 */
export function chartLineColor(): string {
  if (typeof document === "undefined") return DARK.line;
  return document.documentElement.dataset.theme === "light" ? LIGHT.line : DARK.line;
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

  // 初始化
  useEffect(() => {
    if (!ref.current) return;
    const theme =
      document.documentElement.dataset.theme === "light" ? "wb-light" : "wb-dark";
    chartRef.current = echarts.init(ref.current, theme, { renderer: "canvas" });

    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // 主题切换时重新初始化
  useEffect(() => {
    const obs = new MutationObserver(() => {
      if (!ref.current) return;
      chartRef.current?.dispose();
      const theme =
        document.documentElement.dataset.theme === "light" ? "wb-light" : "wb-dark";
      chartRef.current = echarts.init(ref.current, theme, { renderer: "canvas" });
      chartRef.current.setOption(option, { notMerge: true, lazyUpdate: false });
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [option]);

  // option 变更
  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge, lazyUpdate });
  }, [option, notMerge, lazyUpdate]);

  return <div ref={ref} style={style} className={className} />;
}

export { echarts };
