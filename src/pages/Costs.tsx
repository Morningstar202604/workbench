import { useEffect } from "react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { CostDashboard } from "./ai/CostDashboard";

/**
 * 成本页：只放成本仪表盘。
 *
 * 原先成本面板与 AI 进程/会话挤在同一页（拆过一次仍是上下堆叠），
 * 而「花了多少钱」与「有哪些 AI 进程在跑」是两个不同的问题，
 * 各自出现的时机也不同。独立成页后 AI 会话页专注进程与会话。
 */
export default function Costs() {
  const loadCostOverview = useStore(useShallow((s) => s.loadCostOverview));

  useEffect(() => {
    void loadCostOverview();
  }, [loadCostOverview]);

  return (
    <div className="flex flex-col gap-4">
      <CostDashboard />
    </div>
  );
}
