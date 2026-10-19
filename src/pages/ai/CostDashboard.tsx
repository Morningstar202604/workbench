import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Coins,
  DollarSign,
  Hash,
  RefreshCw,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { EChart } from "../../lib/echarts";
import { chartGapColor, seriesColors } from "../../lib/chartTheme";
import { useStore } from "../../lib/store";
import { useShallow } from "zustand/react/shallow";
import { useT } from "../../lib/i18n";
import { Btn, Card, ConfirmDialog, SectionTitle, Spinner, StatCard } from "../../ui";
import { formatTokens, formatUsd } from "../../lib/util";
import { isPieWorthRendering } from "../../lib/aggregate";

/**
 * 成本仪表盘：预算告警、四项统计、预算进度条、趋势/模型分解图。
 * 从 AiSessions（原 930 行）拆出，页面只负责组合。
 */
export function CostDashboard() {
  const t = useT();
  const [confirmClear, setConfirmClear] = useState(false);

  const {
    theme,
    costOverview,
    costTrend,
    costModelBreakdown,
    costLoading,
    scanCosts,
    clearCosts,
  } = useStore(
    useShallow((s) => ({
      theme: s.theme,
      costOverview: s.costOverview,
      costTrend: s.costTrend,
      costModelBreakdown: s.costModelBreakdown,
      costLoading: s.costLoading,
      scanCosts: s.scanCosts,
      clearCosts: s.clearCosts,
    }))
  );

  const colors = useMemo(() => seriesColors(theme), [theme]);

  const totalTokensDisplay = useMemo(() => {
    if (!costOverview) return "—";
    return formatTokens(
      costOverview.total_input_tokens + costOverview.total_output_tokens
    );
  }, [costOverview]);

  const budgetStatus = useMemo(() => {
    if (!costOverview) return null;
    return {
      dailyPct: costOverview.daily_pct,
      monthlyPct: costOverview.monthly_pct,
      exceeded: costOverview.budget_exceeded,
      nearLimit:
        costOverview.daily_pct >= costOverview.alert_threshold_pct ||
        costOverview.monthly_pct >= costOverview.alert_threshold_pct,
    };
  }, [costOverview]);

  const costTrendChart = useMemo(() => {
    if (!costTrend.length) return null;
    // 后端契约是 YYYY-MM-DD；slice(5) 取 MM-DD
    const days = costTrend.map((r) => r.day.slice(5));
    return {
      grid: { left: 50, right: 16, top: 20, bottom: 24 },
      tooltip: {
        trigger: "axis",
        formatter: (
          params: { name: string; value: number; seriesName: string; marker: string }[]
        ) => {
          const p = params[0];
          return `${p.name}<br/>${t("ai.costTrendTooltip", { value: p.value.toFixed(3) })}`;
        },
      },
      legend: {
        data: [t("ai.costLegend")],
        top: 0,
        right: 8,
        textStyle: { fontSize: 10 },
      },
      xAxis: { type: "category", data: days, boundaryGap: false },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 10, formatter: (v: number) => `$${v.toFixed(2)}` },
      },
      series: [
        {
          id: "cost-trend",
          name: t("ai.costLegend"),
          type: "line",
          smooth: true,
          data: costTrend.map((r) => Math.round(r.cost * 1000) / 1000),
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${colors[0]}30` },
                { offset: 1, color: `${colors[0]}05` },
              ],
            },
          },
          lineStyle: { width: 2 },
          itemStyle: { color: colors[0] },
          symbol: "circle",
          symbolSize: 5,
        },
      ],
    };
  }, [costTrend, t, colors]);

  const modelBreakdownChart = useMemo(() => {
    if (!costModelBreakdown.length) return null;
    const topN = costModelBreakdown.slice(0, 6);
    const data = topN.map((r, i) => ({
      name: r.model.length > 20 ? r.model.slice(0, 20) + "…" : r.model,
      value: Math.round(r.cost * 1000) / 1000,
      itemStyle: { color: colors[i % colors.length] },
    }));
    return {
      tooltip: { trigger: "item", formatter: "{b}: ${c} ({d}%)" },
      legend: {
        orient: "vertical",
        right: 8,
        top: "middle",
        textStyle: { fontSize: 10 },
      },
      series: [
        {
          id: "model-pie",
          type: "pie",
          radius: ["40%", "68%"],
          center: ["35%", "50%"],
          label: { show: false },
          labelLine: { show: false },
          itemStyle: { borderColor: chartGapColor(theme), borderWidth: 2 },
          data,
        },
      ],
    };
  }, [costModelBreakdown, theme, colors]);

  return (
    <div className="flex flex-col gap-4">
      {budgetStatus?.exceeded && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="shrink-0 text-danger" />
          <span className="font-medium text-danger">
            {t("ai.budgetExceeded", {
              daily: budgetStatus.dailyPct.toFixed(0),
              monthly: budgetStatus.monthlyPct.toFixed(0),
            })}
          </span>
        </div>
      )}
      {budgetStatus?.nearLimit && !budgetStatus.exceeded && (
        <div className="flex items-center gap-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="shrink-0 text-warn" />
          <span className="font-medium text-warn">
            {t("ai.budgetNearLimit", {
              daily: budgetStatus.dailyPct.toFixed(0),
              monthly: budgetStatus.monthlyPct.toFixed(0),
              threshold: costOverview?.alert_threshold_pct ?? 0,
            })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={DollarSign}
            label={t("ai.todayCost")}
            value={costOverview ? formatUsd(costOverview.today_cost) : "—"}
            tone="warn"
            bar="bg-warn"
            hint={
              costOverview
                ? t("ai.tokensCount", {
                    count: formatTokens(
                      costOverview.today_input_tokens + costOverview.today_output_tokens
                    ),
                  })
                : undefined
            }
          />
          <StatCard
            icon={TrendingUp}
            label={t("ai.monthCost")}
            value={costOverview ? formatUsd(costOverview.month_cost) : "—"}
            tone="accent"
            bar="bg-accent"
            hint={
              costOverview
                ? t("ai.tokensCount", {
                    count: formatTokens(
                      costOverview.month_input_tokens + costOverview.month_output_tokens
                    ),
                  })
                : undefined
            }
          />
          <StatCard
            icon={Coins}
            label={t("ai.totalCost")}
            value={costOverview ? formatUsd(costOverview.total_cost) : "—"}
            tone="ok"
            bar="bg-ok"
            hint={
              costOverview
                ? t("ai.recordCount", { count: costOverview.record_count })
                : undefined
            }
          />
          <StatCard
            icon={Hash}
            label={t("ai.totalTokens")}
            value={totalTokensDisplay}
            tone="text"
            bar="bg-accent"
            hint={
              costOverview
                ? t("ai.tokensMeasuredEstimated", {
                    measured: costOverview.measured_count,
                    estimated: costOverview.estimated_count,
                  })
                : undefined
            }
          />
        </div>
        <div className="ml-3 flex shrink-0 flex-col gap-2">
          <Btn onClick={scanCosts} disabled={costLoading} title={t("ai.scanCostsTitle")}>
            {costLoading ? <Spinner /> : <RefreshCw size={14} />}
            {costLoading ? t("ai.scanning") : t("ai.scanCosts")}
          </Btn>
          {/* 全量扫描是长任务：明确告诉用户可能要等几秒，避免误以为界面卡死 */}
          {costLoading && (
            <span className="max-w-[180px] text-[11px] leading-snug text-dim">
              {t("ai.scanHint")}
            </span>
          )}
          <Btn
            onClick={() => setConfirmClear(true)}
            className="!py-1 !text-xs"
            title={t("ai.clearCostsTitle")}
          >
            <Trash2 size={12} /> {t("ai.clear")}
          </Btn>
        </div>
      </div>

      {costOverview &&
        (costOverview.daily_budget > 0 || costOverview.monthly_budget > 0) && (
          <Card className="p-4">
            <SectionTitle>{t("ai.budgetProgress")}</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-2">
              {costOverview.daily_budget > 0 && (
                <BudgetBar
                  label={t("ai.today")}
                  pct={costOverview.daily_pct}
                  spent={costOverview.today_cost}
                  total={costOverview.daily_budget}
                />
              )}
              {costOverview.monthly_budget > 0 && (
                <BudgetBar
                  label={t("ai.thisMonth")}
                  pct={costOverview.monthly_pct}
                  spent={costOverview.month_cost}
                  total={costOverview.monthly_budget}
                />
              )}
            </div>
          </Card>
        )}

      {(costTrendChart || modelBreakdownChart) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {costTrendChart && (
            <Card className="p-4 lg:col-span-3">
              <SectionTitle>{t("ai.costTrendTitle")}</SectionTitle>
              <EChart option={costTrendChart} style={{ height: 200 }} lazyUpdate />
            </Card>
          )}
          {modelBreakdownChart && (
            <Card className="p-4 lg:col-span-2">
              <SectionTitle>{t("ai.modelBreakdownTitle")}</SectionTitle>
              {isPieWorthRendering(
                costModelBreakdown.map((r) => [r.model, r.cost] as [string, number])
              ) && (
                <EChart option={modelBreakdownChart} style={{ height: 200 }} lazyUpdate />
              )}
              <div className="mt-2 space-y-1">
                {costModelBreakdown.slice(0, 5).map((r, i) => (
                  <div key={r.model} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: colors[i % colors.length] }}
                    />
                    <span className="flex-1 truncate text-dim" title={r.model}>
                      {r.model}
                    </span>
                    <span className="font-mono text-text">{formatUsd(r.cost)}</span>
                    <span className="text-dim">
                      {formatTokens(r.input_tokens + r.output_tokens)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title={t("ai.clear")}
        body={t("ai.confirmClearCosts")}
        confirmLabel={t("ai.clear")}
        cancelLabel={t("projects.cancel")}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void clearCosts();
        }}
      />
    </div>
  );
}

function BudgetBar({
  label,
  pct,
  spent,
  total,
}: {
  label: string;
  pct: number;
  spent: number;
  total: number;
}) {
  const t = useT();
  const clamped = Math.min(pct, 100);
  const exceeded = pct >= 100;
  const nearLimit = pct >= 80 && pct < 100;
  const barColor = exceeded ? "bg-danger" : nearLimit ? "bg-warn" : "bg-accent";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-dim">{t("ai.budgetBarLabel", { label })}</span>
        <span className="font-mono">
          {formatUsd(spent)} / {formatUsd(total)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel2">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
