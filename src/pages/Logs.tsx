import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "../lib/store";
import { readLogs, clearLogs } from "../lib/api";
import { Btn } from "../ui";
import { t as translate, useT } from "../lib/i18n";

/**
 * Log viewer — displays the Rust backend logs without needing the DevTools console.
 *
 * 日志是外部系统（后端文件）的数据：拉取本身是异步副作用，setState 落在
 * promise 回调里而非 effect 同步体，因此不会引发级联渲染。
 */
export default function Logs() {
  const t = useT();
  const setToast = useStore((s) => s.setToast);
  const [content, setContent] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      setContent(await readLogs(500));
    } catch {
      setContent(translate("logs.unavailable"));
    }
  }, []);

  useEffect(() => {
    // 日志来自外部系统（后端日志文件），effect 在这里订阅它属正当用法。
    // 该规则把「effect 内立即调用会 setState 的异步函数」也标为级联渲染风险；
    // 实际 setState 发生在 await 之后的微任务里，不在同步渲染路径上。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 见上
    void load();
  }, [load]);

  // 自动刷新（每 3 秒）
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const handleClear = async () => {
    try {
      await clearLogs();
      setContent(t("logs.cleared"));
      setToast(t("logs.clearedToast"));
    } catch {
      setToast(t("logs.clearFailed"));
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
        <span className="text-sm font-medium">{t("logs.title")}</span>
        <label className="ml-3 flex items-center gap-1.5 text-xs text-dim">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-accent"
          />
          {t("logs.autoRefresh")}
        </label>
        <div className="ml-auto flex gap-2">
          <Btn onClick={load}>
            <RefreshCw size={14} /> {t("logs.refresh")}
          </Btn>
          <Btn variant="danger" onClick={handleClear}>
            <Trash2 size={14} /> {t("logs.clear")}
          </Btn>
        </div>
      </div>

      <pre
        ref={preRef}
        className="flex-1 overflow-auto rounded-lg border border-line bg-bg p-4 font-mono text-[11px] leading-relaxed text-dim"
      >
        {content || t("logs.empty")}
      </pre>
    </div>
  );
}
