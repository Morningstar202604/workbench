import { useEffect, useRef, useState } from "react";
import { DollarSign, Download, Eraser, Globe, RefreshCw, Upload } from "lucide-react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { isTauri } from "../lib/api";
import { APP_VERSION, setLang, useLang, useT, type Lang } from "../lib/i18n";
import { Badge, Btn, Card, Field, SectionTitle } from "../ui";
import { formatUsd } from "../lib/util";
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
  { ms: 1000, key: "settings.refresh1s" },
  { ms: 3000, key: "settings.refresh3s" },
  { ms: 5000, key: "settings.refresh5s" },
  { ms: 10000, key: "settings.refresh10s" },
  { ms: 30000, key: "settings.refresh30s" },
];

const ALERT_OPTIONS = [
  { value: 50, key: "settings.alert50" },
  { value: 70, key: "settings.alert70" },
  { value: 80, key: "settings.alert80" },
  { value: 90, key: "settings.alert90" },
  { value: 100, key: "settings.alert100" },
];

const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "简体中文" },
  { code: "ja", label: "日本語" },
];

export default function Settings() {
  const t = useT();
  const lang = useLang();
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
    void loadCostSettings();
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
    setToast(t("settings.exported"));
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as WorkbenchData;
      if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks)) {
        throw new Error(t("settings.importBadStructure"));
      }
      // Schema 字段校验
      for (const p of parsed.projects) {
        if (typeof p.id !== "string" || typeof p.name !== "string") {
          throw new Error(t("settings.importBadProject"));
        }
      }
      for (const task of parsed.tasks) {
        if (typeof task.id !== "string" || typeof task.title !== "string") {
          throw new Error(t("settings.importBadTask"));
        }
        if (!["todo", "doing", "done"].includes(task.status)) {
          throw new Error(t("settings.importBadStatus"));
        }
      }
      persistData(parsed);
      setToast(
        t("settings.imported", {
          projects: parsed.projects.length,
          tasks: parsed.tasks.length,
        })
      );
    } catch (e) {
      setToast(t("settings.importFailed", { err: String(e) }));
    }
  };

  const saveCostConfig = async () => {
    // 只有真正落盘成功才清掉「未保存」标记：保存失败的草稿必须继续显示为待保存，
    // 否则用户关掉页面就以为已经生效了。
    const ok = await updateCostSettings(costDraft);
    if (ok) setCostDirty(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── 页面标题（与其他页头部呼应） ── */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">{t("settings.pageTitle")}</h2>
        <span className="text-xs text-dim">{t("settings.pageSub")}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ── 外观 ── */}
        <Card className="p-4">
          <SectionTitle>{t("settings.appearance")}</SectionTitle>
          <div className="flex items-center gap-2">
            <Btn
              variant={theme === "dark" ? "primary" : "ghost"}
              onClick={() => setTheme("dark")}
            >
              {t("settings.dark")}
            </Btn>
            <Btn
              variant={theme === "light" ? "primary" : "ghost"}
              onClick={() => setTheme("light")}
            >
              {t("settings.light")}
            </Btn>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            {t("settings.appearanceHint")}
          </p>

          {/* ── 语言 ── */}
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-dim">
              <Globe size={13} />
              {t("settings.language")}
            </div>
            <div className="flex flex-wrap gap-2">
              {LANG_OPTIONS.map((o) => (
                <Btn
                  key={o.code}
                  variant={lang === o.code ? "primary" : "ghost"}
                  onClick={() => setLang(o.code)}
                >
                  {o.label}
                </Btn>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-dim">
              {t("settings.languageHint")}
            </p>
          </div>
        </Card>

        {/* ── 刷新 ── */}
        <Card className="p-4">
          <SectionTitle>{t("settings.refresh")}</SectionTitle>
          <Field label={t("settings.refreshLabel")}>
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
                  {t(o.key)}
                </Btn>
              ))}
            </div>
          </Field>
          <p className="text-[11px] leading-relaxed text-dim">
            {t("settings.refreshHint")}
          </p>
        </Card>

        {/* ── ⚡ 成本计量（新增主 section）── */}
        <Card className="p-4">
          <SectionTitle
            extra={costDirty && <Badge tone="warn">{t("settings.unsaved")}</Badge>}
          >
            <span className="flex items-center gap-1.5">
              <DollarSign size={14} />
              {t("settings.cost")}
            </span>
          </SectionTitle>

          <div className="flex flex-col gap-4">
            {/* 预算设置 */}
            <div>
              <div className="mb-2 text-xs font-medium text-dim">
                {t("settings.budgetLabel")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-dim">
                    {t("settings.dailyBudget")}
                  </span>
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
                  <span className="mb-1 block text-[11px] text-dim">
                    {t("settings.monthlyBudget")}
                  </span>
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
            <Field label={t("settings.alertLabel")}>
              <div className="flex flex-wrap gap-2">
                {ALERT_OPTIONS.map((o) => (
                  <Btn
                    key={o.value}
                    variant={
                      costDraft.alert_threshold_pct === o.value ? "primary" : "ghost"
                    }
                    onClick={() => updateCost({ alert_threshold_pct: o.value })}
                  >
                    {t(o.key)}
                  </Btn>
                ))}
              </div>
            </Field>

            {/* 计价偏好 */}
            <Field label={t("settings.pricingLabel")}>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={costDraft.include_estimated}
                    onChange={(e) => updateCost({ include_estimated: e.target.checked })}
                    className="rounded border-line accent-accent"
                  />
                  <span>{t("settings.includeEstimated")}</span>
                </label>
              </div>
            </Field>

            {/* 当前状态展示 */}
            {costOverview && (
              <div className="rounded-lg border border-line bg-panel2 p-3">
                <div className="mb-2 text-xs font-medium text-dim">
                  {t("settings.statusTitle")}
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-dim">{t("settings.recordCount")}</div>
                    <div className="font-mono font-medium">
                      {costOverview.record_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-dim">{t("settings.measuredEstimated")}</div>
                    <div className="font-mono font-medium">
                      {costOverview.measured_count} / {costOverview.estimated_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-dim">{t("settings.totalCost")}</div>
                    <div className="font-mono font-medium">
                      {formatUsd(costOverview.total_cost)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <Btn variant="primary" onClick={saveCostConfig} disabled={!costDirty}>
                <RefreshCw size={14} /> {t("settings.applyCost")}
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
                <Eraser size={14} /> {t("settings.restoreDefaults")}
              </Btn>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-dim">
            {t("settings.costNote")}
          </p>
        </Card>

        {/* ── 数据备份（右列，与刷新/外观同排） ── */}
        <Card className="p-4 xl:row-span-2">
          <SectionTitle>{t("settings.data")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={exportJson}>
              <Download size={14} /> {t("settings.exportJson")}
            </Btn>
            <Btn onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> {t("settings.importJson")}
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
            {t("settings.dataLocation")}:
            {isTauri() ? (
              <>
                {" "}
                {t("settings.dataDesktop")}{" "}
                <span className="font-mono">
                  %APPDATA%\com.workbench.desktop\data.json
                </span>
                {t("settings.dataLocalNote")}
              </>
            ) : (
              <> {t("settings.dataBrowserNote")}</>
            )}
          </p>
        </Card>
      </div>

      {/* ── 关于 ── */}
      <Card className="p-4">
        <SectionTitle>{t("settings.about")}</SectionTitle>
        <div className="flex flex-col gap-1.5 text-xs text-dim">
          <div className="flex items-center gap-2">
            {t("settings.version")} <Badge tone="dim">v{APP_VERSION}</Badge>
            {t("settings.mode")}{" "}
            <Badge tone={isTauri() ? "ok" : "warn"}>
              {isTauri() ? t("settings.modeTauri") : t("settings.modeBrowser")}
            </Badge>
          </div>
          <p>{t("settings.aboutNote")}</p>
          <p className="text-warn">{t("settings.killWarning")}</p>
        </div>
      </Card>
    </div>
  );
}
