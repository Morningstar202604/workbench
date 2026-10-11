import { useEffect, useRef, useState } from "react";
import { FileText, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "../lib/store";
import { readLogs, clearLogs } from "../lib/api";
import { Btn } from "../ui";

/**
 * Log viewer — displays the Rust backend logs without needing the DevTools console.
 */
export default function Logs() {
  const { setToast } = useStore();
  const [content, setContent] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = async () => {
    try {
      setContent(await readLogs(500));
    } catch {
      setContent("(日志暂不可用 — 仅在桌面端运行时写入)");
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 自动刷新（每 3 秒）
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const handleClear = async () => {
    try {
      await clearLogs();
      setContent("(已清空)");
      setToast("日志已清空");
    } catch {
      setToast("清空日志失败");
    }
  };

  const preRef = useRef<HTMLPreElement>(null);

  // 自动刷新后滚动到底
  useEffect(() => {
    if (autoRefresh && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [content, autoRefresh]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 pb-3">
        <FileText size={16} className="text-accent" />
        <span className="text-sm font-medium">运行日志</span>
        <label className="ml-3 flex items-center gap-1.5 text-xs text-dim">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-accent"
          />
          自动刷新
        </label>
        <div className="ml-auto flex gap-2">
          <Btn onClick={load}>
            <RefreshCw size={14} /> 刷新
          </Btn>
          <Btn variant="danger" onClick={handleClear}>
            <Trash2 size={14} /> 清空
          </Btn>
        </div>
      </div>

      <pre ref={preRef} className="flex-1 overflow-auto rounded-lg border border-line bg-bg p-4 font-mono text-[11px] leading-relaxed text-dim">
        {content || "(暂无日志)"}
      </pre>
    </div>
  );
}
