import { useEffect } from "react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { CostDashboard } from "./ai/CostDashboard";
import { AiProcessPanel, OpencodeSessionsPanel } from "./ai/AiProcessPanel";
import { SessionFilesPanel } from "./ai/SessionFilesPanel";

/**
 * AI 会话页：只负责加载与布局，四块内容各自独立成组件
 * （成本仪表盘 / AI 进程 / 在线会话 / 本地会话文件）。
 */
export default function AiSessions() {
  const { refreshAi, loadCostOverview } = useStore(
    useShallow((s) => ({
      refreshAi: s.refreshAi,
      loadCostOverview: s.loadCostOverview,
    }))
  );

  useEffect(() => {
    void refreshAi();
    void loadCostOverview();
  }, [refreshAi, loadCostOverview]);

  return (
    <div className="flex flex-col gap-4">
      <CostDashboard />
      <AiProcessPanel />
      <OpencodeSessionsPanel />
      <SessionFilesPanel />
    </div>
  );
}
