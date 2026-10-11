import { useMemo, useState } from "react";
import { FolderOpen, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { EChart, chartGapColor } from "../lib/echarts";
import { useStore } from "../lib/store";
import { openExternal } from "../lib/api";
import { Badge, Btn, Card, Empty, Field, Modal, Table, Td, Tr, inputCls } from "../ui";
import { shortPath } from "../lib/util";
import type { Project } from "../types";

const STATUS_MAP: Record<string, { label: string; tone: string; color: string }> = {
  active: { label: "活跃", tone: "ok", color: "#34d399" },
  paused: { label: "暂停", tone: "warn", color: "#fbbf24" },
  archived: { label: "归档", tone: "dim", color: "#64748b" },
};

interface Draft {
  id?: string;
  name: string;
  path: string;
  status: string;
  tags: string;
  pinned: boolean;
  note: string;
}

const emptyDraft: Draft = { name: "", path: "", status: "active", tags: "", pinned: false, note: "" };

export default function Projects() {
  const { data, devs, addProject, updateProject, deleteProject, setView } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);

  const runningDirs = useMemo(
    () => devs.map((d) => d.project_dir?.toLowerCase() ?? "").filter(Boolean),
    [devs]
  );

  const isRunning = (p: Project) =>
    !!p.path && runningDirs.some((dir) => dir === p.path.toLowerCase() || dir.startsWith(p.path.toLowerCase()));

  const sorted = useMemo(
    () => [...data.projects].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [data.projects]
  );

  // 状态分布数据
  const statusDist = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data.projects) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return [...m.entries()].map(([s, c]) => ({
      name: STATUS_MAP[s]?.label ?? s,
      value: c,
      itemStyle: { color: STATUS_MAP[s]?.color ?? "#64748b" },
    }));
  }, [data.projects]);

  // 任务数 Top5 项目
  const taskCountData = useMemo(() => {
    return data.projects
      .map((p) => ({
        name: p.name.length > 10 ? p.name.slice(0, 10) + "…" : p.name,
        count: data.tasks.filter((t) => t.project_id === p.id).length,
      }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [data.projects, data.tasks]);

  const statusPieOption = useMemo(() => ({
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["46%", "68%"],
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: chartGapColor(), borderWidth: 2 },
        data: statusDist,
      },
    ],
  }), [statusDist]);

  const taskBarOption = useMemo(() => {
    return {
      grid: { left: 90, right: 24, top: 8, bottom: 8 },
      xAxis: { type: "value", show: false },
      yAxis: {
        type: "category",
        data: taskCountData.map((d) => d.name),
        inverse: true,
        axisLabel: { fontSize: 9 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: taskCountData.map((d) => ({
            value: d.count,
            itemStyle: {
              color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: "#a78bfa60" }, { offset: 1, color: "#a78bfa" }] },
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 12,
          label: { show: true, position: "right", fontSize: 10 },
        },
      ],
    };
  }, [taskCountData]);

  const submit = () => {
    if (!draft?.name.trim()) return;
    const payload = {
      name: draft.name,
      path: draft.path,
      status: draft.status,
      tags: draft.tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
      pinned: draft.pinned,
      note: draft.note,
    };
    if (draft.id) updateProject(draft.id, payload);
    else addProject(payload);
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── 顶部图表 ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-medium">状态分布</h3>
          {data.projects.length > 0 ? (
            <>
              <EChart option={statusPieOption} style={{ height: 140 }} notMerge lazyUpdate />
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {Object.entries(STATUS_MAP).map(([k, v]) => {
                  const count = data.projects.filter((p) => p.status === k).length;
                  if (!count) return null;
                  return (
                    <span key={k} className="flex items-center gap-1 text-[11px] text-dim">
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                      {v.label} <span className="font-mono text-text">{count}</span>
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty>暂无项目</Empty>
          )}
        </Card>
        <Card className="p-4 md:col-span-2">
          <h3 className="mb-2 text-sm font-medium">任务数 Top 项目</h3>
          {taskCountData.length > 0 ? (
            <EChart option={taskBarOption} style={{ height: 160 }} notMerge lazyUpdate />
          ) : (
            <Empty>没有关联任务的项目</Empty>
          )}
        </Card>
      </div>

      {/* ── 顶部操作 ── */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-dim">共 {data.projects.length} 个项目</span>
        <Btn variant="primary" className="ml-auto" onClick={() => setDraft({ ...emptyDraft })}>
          <Plus size={14} /> 新建项目
        </Btn>
      </div>

      {data.projects.length === 0 ? (
        <Card>
          <Empty>还没有项目。点「新建项目」把本机目录登记进来，运行中的开发服务器会自动打上「运行中」标记。</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => {
            const st = STATUS_MAP[p.status] ?? STATUS_MAP.active;
            const tasks = data.tasks.filter((t) => t.project_id === p.id);
            const doing = tasks.filter((t) => t.status === "doing").length;
            return (
              <Card key={p.id} className="flex flex-col gap-2 p-4 hover:border-accentsoft transition-colors">
                <div className="flex items-start gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.pinned && <Pin size={12} className="mt-1 text-accent" />}
                  <div className="ml-auto flex gap-1">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {isRunning(p) && <Badge tone="ok">运行中</Badge>}
                  </div>
                </div>
                <div className="truncate font-mono text-[11px] text-dim" title={p.path}>
                  {p.path ? shortPath(p.path, 60) : "未绑定路径"}
                </div>
                {p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <Badge key={t} tone="dim">{t}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-dim">
                  <button className="text-accent hover:underline" onClick={() => setView("tasks")}>
                    {tasks.length} 个任务
                  </button>
                  {doing > 0 && <Badge tone="accent">{doing} 进行中</Badge>}
                </div>
                <div className="mt-1 flex gap-1.5 border-t border-line/60 pt-2">
                  {p.path && (
                    <Btn className="!px-2 !py-1 !text-xs" title="打开目录" onClick={() => openExternal(p.path)}>
                      <FolderOpen size={12} />
                    </Btn>
                  )}
                  <Btn
                    className="!px-2 !py-1 !text-xs"
                    title="编辑"
                    onClick={() =>
                      setDraft({
                        id: p.id,
                        name: p.name,
                        path: p.path,
                        status: p.status,
                        tags: p.tags.join(", "),
                        pinned: p.pinned,
                        note: p.note,
                      })
                    }
                  >
                    <Pencil size={12} />
                  </Btn>
                  <Btn
                    variant="danger"
                    className="!px-2 !py-1 !text-xs"
                    title="删除项目（任务会保留但解除关联）"
                    onClick={() => {
                      if (confirm(`删除项目「${p.name}」？关联的任务会保留但解除关联。`)) deleteProject(p.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-medium">表格视图</h3>
        <Table head={["项目", "状态", "路径", "任务数", "运行中"]}>
          {sorted.map((p) => (
            <Tr key={p.id}>
              <Td className="font-medium">{p.name}</Td>
              <Td>
                <Badge tone={STATUS_MAP[p.status]?.tone ?? "dim"}>{STATUS_MAP[p.status]?.label ?? p.status}</Badge>
              </Td>
              <Td className="max-w-[280px] truncate font-mono text-[11px] text-dim" title={p.path}>
                {p.path || "-"}
              </Td>
              <Td className="text-xs text-dim">{data.tasks.filter((t) => t.project_id === p.id).length}</Td>
              <Td>{isRunning(p) ? <Badge tone="ok">是</Badge> : <Badge tone="dim">否</Badge>}</Td>
            </Tr>
          ))}
        </Table>
      </Card>

      <Modal
        open={!!draft}
        title={draft?.id ? "编辑项目" : "新建项目"}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Btn onClick={() => setDraft(null)}>取消</Btn>
            <Btn variant="primary" onClick={submit}>
              保存
            </Btn>
          </>
        }
      >
        {draft && (
          <>
            <Field label="项目名称">
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例如：商城前端重构"
              />
            </Field>
            <Field label="本机路径（绑定后运行中的开发服务器会自动标记）">
              <input
                className={inputCls}
                value={draft.path}
                onChange={(e) => setDraft({ ...draft, path: e.target.value })}
                placeholder="C:\proj\shop-web"
              />
            </Field>
            <Field label="状态">
              <select
                className={inputCls}
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="active">活跃</option>
                <option value="paused">暂停</option>
                <option value="archived">归档</option>
              </select>
            </Field>
            <Field label="标签（逗号分隔）">
              <input
                className={inputCls}
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="前端, v2"
              />
            </Field>
            <Field label="备注">
              <textarea
                className={inputCls}
                rows={3}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.pinned}
                onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
              />
              置顶显示
            </label>
          </>
        )}
      </Modal>
    </div>
  );
}
