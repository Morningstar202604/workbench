import { useEffect, useRef, useState } from "react";
import { DollarSign, Download, Eraser, RefreshCw, Upload } from "lucide-react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { isTauri } from "../lib/api";
import { Badge, Btn, Card, Field, SectionTitle } from "../ui";
import type { CostSettings, WorkbenchData } from "../types";

// ════════════════════════════════════════════════════════════
// 自定义 Hook: 成本设置的本地编辑状态
// ════════════════════════════════════════════════════════════
function useCostSettingsEditor(current: CostSettings) {
  const [draft, setDraft] = useState<CostSettings>(current);
  const [dirty, setDirty] = useState(false);
  // 「渲染期派生状态」：记住上一次同步所依据的服务端值，只有它真正变化时
  // 才覆盖草稿（React 官方推荐模式）。用 state 而非 ref 是因为这里要在
  // 渲染期读写，React 要求渲染期状态变更必须走 setState 才能触发重渲染。
  const [synced, setSynced] = useState(current);

  if (synced !== current) {
    setSynced(current);
    setDraft(current);
    setDirty(false);
  }

  const update = (patch: Partial<CostSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  return { draft, dirty, update, setDirty };
}

// ════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════

const REFRESH_OPTIONS = [
  { ms: 1000, label: "1 秒" },
  { ms: 3000, label: "3 秒" },
  { ms: 5000, label: "5 秒" },
  { ms: 10000, label: "10 秒" },
  { ms: 30000, label: "30 秒" },
];

const ALERT_OPTIONS = [
  { value: 50, label: "50%" },
  { value: 70, label: "70%" },
  { value: 80, label: "80%" },
  { value: 90, label: "90%" },
  { value: 100, label: "100%（用尽才告警）" },
];

export default function Settings() {
  const {
    theme,
    setTheme,
    refreshMs,
    setRefreshMs,
    data,
    persistData,
    setToast,
    refreshRuntime,
    // 成本
    costSettings,
    loadCostSettings,
    updateCostSettings,
    costOverview,
  } = useStore(
    useShallow((s) => ({
      theme: s.theme,
      setTheme: s.setTheme,
      refreshMs: s.refreshMs,
      setRefreshMs: s.setRefreshMs,
      data: s.data,
      persistData: s.persistData,
      setToast: s.setToast,
      refreshRuntime: s.refreshRuntime,
      costSettings: s.costSettings,
      loadCostSettings: s.loadCostSettings,
      updateCostSettings: s.updateCostSettings,
      costOverview: s.costOverview,
    }))
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const {
    draft: costDraft,
    dirty: costDirty,
    update: updateCost,
    setDirty: setCostDirty,
  } = useCostSettingsEditor(costSettings);

  useEffect(() => {
    loadCostSettings();
  }, [loadCostSettings]);

  // ── 导入 / 导出 ──
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workbench-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("已导出 JSON 备份");
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as WorkbenchData;
      if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks)) {
        throw new Error("文件结构不符合预期（需要 projects / tasks 数组）");
      }
      // Schema 字段校验
      for (const p of parsed.projects) {
        if (typeof p.id !== "string" || typeof p.name !== "string") {
          throw new Error("项目字段类型错误（id / name 必须为字符串）");
        }
      }
      for (const t of parsed.tasks) {
        if (typeof t.id !== "string" || typeof t.title !== "string") {
          throw new Error("任务字段类型错误（id / title 必须为字符串）");
        }
        if (!["todo", "doing", "done"].includes(t.status)) {
          throw new Error("任务状态非法（需为 todo / doing / done）");
        }
      }
      persistData(parsed);
      setToast(`已导入 ${parsed.projects.length} 个项目、${parsed.tasks.length} 个任务`);
    } catch (e) {
      setToast(`导入失败: ${String(e)}`);
    }
  };

  const saveCostConfig = async () => {
    await updateCostSettings(costDraft);
    setCostDirty(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── 页面标题（与其他页头部呼应） ── */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">设置</h2>
        <span className="text-xs text-dim">主题、刷新、成本与数据管理</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ── 外观 ── */}
        <Card className="p-4">
          <SectionTitle>外观</SectionTitle>
          <div className="flex items-center gap-2">
            <Btn
              variant={theme === "dark" ? "primary" : "ghost"}
              onClick={() => setTheme("dark")}
            >
              深色
            </Btn>
            <Btn
              variant={theme === "light" ? "primary" : "ghost"}
              onClick={() => setTheme("light")}
            >
              浅色
            </Btn>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            切换后图表主题将自动跟随；标题栏的置顶按钮随时可用。
          </p>
        </Card>

        {/* ── 刷新 ── */}
        <Card className="p-4">
          <SectionTitle>运行时刷新</SectionTitle>
          <Field label="进程 / 端口 / 开发服务器 / AI 进程刷新间隔">
            <div className="flex flex-wrap gap-2">
              {REFRESH_OPTIONS.map((o) => (
                <Btn
                  key={o.ms}
                  variant={refreshMs === o.ms ? "primary" : "ghost"}
                  onClick={() => {
                    setRefreshMs(o.ms);
                    refreshRuntime();
                  }}
                >
                  {o.label}
                </Btn>
              ))}
            </div>
          </Field>
          <p className="text-[11px] leading-relaxed text-dim">
            说明：进程快照包含约 220ms 的 CPU 采样窗口，1 秒间隔已接近物理下限；间隔越短
            CPU 占用越高。
          </p>
        </Card>

        {/* ── ⚡ 成本计量（新增主 section）── */}
        <Card className="p-4">
          <SectionTitle extra={costDirty && <Badge tone="warn">未保存</Badge>}>
            <span className="flex items-center gap-1.5">
              <DollarSign size={14} />
              成本计量
            </span>
          </SectionTitle>

          <div className="flex flex-col gap-4">
            {/* 预算设置 */}
            <div>
              <div className="mb-2 text-xs font-medium text-dim">
                预算限制（设为 0 表示不限）
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-dim">日预算 (USD)</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="w-full rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
                    value={costDraft.daily_budget}
                    onChange={(e) =>
                      updateCost({
                        daily_budget: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-dim">月预算 (USD)</span>
                  <input
                    type="number"
                    step="5"
                    min="0"
                    className="w-full rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
                    value={costDraft.monthly_budget}
                    onChange={(e) =>
                      updateCost({
                        monthly_budget: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </label>
              </div>
            </div>

            {/* 告警阈值 */}
            <Field label="超支告警阈值（达到百分比时发出系统通知）">
              <div className="flex flex-wrap gap-2">
                {ALERT_OPTIONS.map((o) => (
                  <Btn
                    key={o.value}
                    variant={
                      costDraft.alert_threshold_pct === o.value ? "primary" : "ghost"
                    }
                    onClick={() => updateCost({ alert_threshold_pct: o.value })}
                  >
                    {o.label}
                  </Btn>
                ))}
              </div>
            </Field>

            {/* 计价偏好 */}
            <Field label="计价方式">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={costDraft.include_estimated}
                    onChange={(e) => updateCost({ include_estimated: e.target.checked })}
                    className="rounded border-line accent-accent"
                  />
                  <span>计入启发式估算记录（无 usage 文件按 4 chars/token 粗估）</span>
                </label>
              </div>
            </Field>

            {/* 当前状态展示 */}
            {costOverview && (
              <div className="rounded-lg border border-line bg-panel2 p-3">
                <div className="mb-2 text-xs font-medium text-dim">当前计量状态</div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-dim">总记录</div>
                    <div className="font-mono font-medium">
                      {costOverview.record_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-dim">实测 / 估算</div>
                    <div className="font-mono font-medium">
                      {costOverview.measured_count} / {costOverview.estimated_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-dim">累计成本</div>
                    <div className="font-mono font-medium">
                      ${costOverview.total_cost.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <Btn variant="primary" onClick={saveCostConfig} disabled={!costDirty}>
                <RefreshCw size={14} /> 应用成本设置
              </Btn>
              <Btn
                onClick={() =>
                  updateCost({
                    daily_budget: 5,
                    monthly_budget: 50,
                    alert_threshold_pct: 80,
                    include_estimated: true,
                  })
                }
              >
                <Eraser size={14} /> 恢复默认
              </Btn>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-dim">
            计量数据来源：~/.claude/projects 与 ~/.codex/sessions 下 *.jsonl
            会话文件。定价表内置 40+ 主流模型公开价格，可按需在 AI 会话页手动触发扫描。
          </p>
        </Card>

        {/* ── 数据备份（右列，与刷新/外观同排） ── */}
        <Card className="p-4 xl:row-span-2">
          <SectionTitle>数据</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={exportJson}>
              <Download size={14} /> 导出 JSON
            </Btn>
            <Btn onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> 导入 JSON
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            数据存储位置：
            {isTauri() ? (
              <>
                桌面端{" "}
                <span className="font-mono">
                  %APPDATA%\com.workbench.desktop\data.json
                </span>
                ，不上传任何服务器；改动防抖 300ms 后自动落盘。
              </>
            ) : (
              <>浏览器预览模式下不持久化，导入导出仅作演示。</>
            )}
          </p>
        </Card>
      </div>

      {/* ── 关于 ── */}
      <Card className="p-4">
        <SectionTitle>关于</SectionTitle>
        <div className="flex flex-col gap-1.5 text-xs text-dim">
          <div className="flex items-center gap-2">
            版本 <Badge tone="dim">v0.1.0</Badge>
            模式{" "}
            <Badge tone={isTauri() ? "ok" : "warn"}>
              {isTauri() ? "Tauri 桌面端" : "浏览器预览"}
            </Badge>
          </div>
          <p>
            进程与端口数据来自本机 sysinfo 与 netstat；AI 会话另支持 opencode
            本地服务（默认端口 4096）、Claude Code / Codex CLI
            会话记录文件扫描、成本计量与预算告警。
          </p>
          <p className="text-warn">
            结束进程是不可逆操作，执行前请确认没有未保存的工作。
          </p>
        </div>
      </Card>
    </div>
  );
}
