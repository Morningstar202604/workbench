import { useEffect } from "react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { AiProcessPanel, OpencodeSessionsPanel } from "./ai/AiProcessPanel";
import { SessionFilesPanel } from "./ai/SessionFilesPanel";

/** AI 会话页：进程、在线会话、本地会话文件。成本已独立到「成本」页。 */
export default function AiSessions() {
  const { refreshAi } = useStore(useShallow((s) => ({ refreshAi: s.refreshAi })));

  useEffect(() => {
    void refreshAi();
  }, [refreshAi]);

  return (
    <div className="flex flex-col gap-4">
      <AiProcessPanel />
      <OpencodeSessionsPanel />
      <SessionFilesPanel />
    </div>
  );
}
