import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Plus,
  Trash2,
} from "lucide-react";
import { EChart, chartGapColor } from "../lib/echarts";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../lib/store";
import { Badge, Btn, Empty, Field, Modal, SectionTitle, inputCls } from "../ui";
import { dueLabel } from "../lib/util";
import type { Task } from "../types";

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "todo", label: "待办", color: "#64748b" },
  { key: "doing", label: "进行中", color: "#22d3ee" },
  { key: "done", label: "已完成", color: "#34d399" },
];

const PRIORITIES: Record<string, { label: string; tone: string }> = {
  low: { label: "低", tone: "dim" },
  normal: { label: "普通", tone: "accent" },
  high: { label: "高", tone: "danger" },
};

export default function Tasks() {
  const { data, addTask, moveTask, updateTask, deleteTask } = useStore();
  const [projectFilter, setProjectFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [taskDraft, setTaskDraft] = useState<Task | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const projectName = (id: string | null) =>
    data.projects.find((p) => p.id === id)?.name ?? null;

  const visible = useMemo(
    () => data.tasks.filter((t) => !projectFilter || t.project_id === projectFilter),
    [data.tasks, projectFilter]
  );

  const patchTask = (patch: Partial<Task>) =>
    setTaskDraft((d) => (d ? { ...d, ...patch } : d));

  const commitTask = () => {
    if (taskDraft) updateTask(taskDraft.id, taskDraft);
    setTaskDraft(null);
  };

  // ── 图表：优先级分布 ──────────────────────────────────────
  const priorityDist = useMemo(() => {
    const m: Record<string, number> = { low: 0, normal: 0, high: 0 };
    for (const t of data.tasks) m[t.priority] = (m[t.priority] ?? 0) + 1;
    return [
      { name: "低", value: m.low, itemStyle: { color: "#64748b" } },
      { name: "普通", value: m.normal, itemStyle: { color: "#22d3ee" } },
      { name: "高", value: m.high, itemStyle: { color: "#ef4444" } },
    ].filter((d) => d.value > 0);
  }, [data.tasks]);

  const priorityPieOption = useMemo(() => ({
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["44%", "66%"],
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: chartGapColor(), borderWidth: 2 },
        data: priorityDist,
      },
    ],
  }), [priorityDist]);

  // 完成率统计
  const completionRate = useMemo(() => {
    if (!data.tasks.length) return 0;
    return Math.round((data.tasks.filter((t) => t.status === "done").length / data.tasks.length) * 100);
  }, [data.tasks]);

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const over = e.over?.id;
    if (!over) return;
    const status = String(over);
    if (!COLUMNS.some((c) => c.key === status)) return;
    const task = data.tasks.find((t) => t.id === id);
    if (task && task.status !== status) moveTask(id, status);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── 图表区 ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-panel2 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 size={14} className="text-warn" /> 优先级分布
          </div>
          {data.tasks.length > 0 ? (
            <>
              <EChart option={priorityPieOption} style={{ height: 130 }} notMerge lazyUpdate />
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {priorityDist.map((d) => (
                  <span key={d.name} className="flex items-center gap-1 text-[11px] text-dim">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: (d.itemStyle as { color: string }).color }} />
                    {d.name} <span className="font-mono text-text">{d.value}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="text-xs text-dim py-6 text-center">暂无任务</div>
          )}
        </div>

        {/* 完成率进度 */}
        <div className="rounded-xl border border-line bg-panel2 p-4 flex flex-col">
          <div className="text-sm font-medium">完成率</div>
          <div className="flex flex-1 items-center justify-center">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg className="h-24 w-24 -rotate-90">
                <circle cx="48" cy="48" r="38" fill="none" stroke="var(--color-panel2)" strokeWidth="8" />
                <circle
                  cx="48" cy="48" r="38" fill="none"
                  stroke="#34d399"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(completionRate / 100) * 239} 239`}
                />
              </svg>
              <span className="absolute text-2xl font-bold text-ok">{completionRate}%</span>
            </div>
          </div>
          <div className="text-center text-xs text-dim">
            {data.tasks.filter((t) => t.status === "done").length} / {data.tasks.length}
          </div>
        </div>

        {/* 各列数量 */}
        <div className="rounded-xl border border-line bg-panel2 p-4">
          <div className="text-sm font-medium mb-3">任务分布</div>
          <div className="space-y-3">
            {COLUMNS.map((c) => {
              const count = data.tasks.filter((t) => t.status === c.key).length;
              const pct = data.tasks.length > 0 ? (count / data.tasks.length) * 100 : 0;
              return (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-dim">{c.label}</span>
                    <span className="font-mono text-text">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: c.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 筛选 ── */}
      <div className="flex flex-wrap items-center gap-3">
        <SectionTitle>看板</SectionTitle>
        <label className="ml-auto flex items-center gap-2 text-xs text-dim">
          按项目筛选
          <select
            className="rounded-lg border border-line bg-panel2 px-2 py-1 text-xs text-text outline-none"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">全部项目</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const tasks = visible.filter((t) => t.status === col.key);
            return (
              <Column
                key={col.key}
                colKey={col.key}
                label={col.label}
                count={tasks.length}
                color={col.color}
                draft={drafts[col.key] ?? ""}
                onDraft={(v) => setDrafts((d) => ({ ...d, [col.key]: v }))}
                onAdd={() => {
                  const title = (drafts[col.key] ?? "").trim();
                  if (!title) return;
                  addTask({ title, status: col.key, project_id: projectFilter || null });
                  setDrafts((d) => ({ ...d, [col.key]: "" }));
                }}
              >
                {tasks.length === 0 ? (
                  <Empty>拖动任务到这里，或在下方输入添加</Empty>
                ) : (
                  tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      projectName={projectName(t.project_id)}
                      onEdit={() => setTaskDraft({ ...t })}
                      onDelete={() => deleteTask(t.id)}
                    />
                  ))
                )}
              </Column>
            );
          })}
        </div>
      </DndContext>

      <Modal
        open={!!taskDraft}
        title="编辑任务"
        onClose={() => setTaskDraft(null)}
        footer={
          <>
            <Btn onClick={() => setTaskDraft(null)}>取消</Btn>
            <Btn variant="primary" onClick={commitTask}>
              完成
            </Btn>
          </>
        }
      >
        {taskDraft && (
          <>
            <Field label="标题">
              <input
                className={inputCls}
                value={taskDraft.title}
                onChange={(e) => patchTask({ title: e.target.value })}
              />
            </Field>
            <Field label="优先级">
              <select
                className={inputCls}
                value={taskDraft.priority}
                onChange={(e) => patchTask({ priority: e.target.value })}
              >
                <option value="low">低</option>
                <option value="normal">普通</option>
                <option value="high">高</option>
              </select>
            </Field>
            <Field label="截止日期">
              <input
                type="date"
                className={inputCls}
                value={taskDraft.due ?? ""}
                onChange={(e) => patchTask({ due: e.target.value || null })}
              />
            </Field>
            <Field label="所属项目">
              <select
                className={inputCls}
                value={taskDraft.project_id ?? ""}
                onChange={(e) => patchTask({ project_id: e.target.value || null })}
              >
                <option value="">未关联</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}

function Column({
  colKey,
  label,
  count,
  color,
  children,
  draft,
  onDraft,
  onAdd,
}: {
  colKey: string;
  label: string;
  count: number;
  color: string;
  children: ReactNode;
  draft: string;
  onDraft: (v: string) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[280px] flex-col rounded-xl border bg-panel p-3 transition-colors ${
        isOver ? "border-accent" : "border-line"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <Badge tone="dim">{count}</Badge>
        <span className="ml-auto h-2 w-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
      <div className="mt-2 flex gap-1.5">
        <input
          className={inputCls}
          placeholder="添加任务，回车确认"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
        />
        <Btn variant="primary" className="!px-2.5" title="添加" onClick={onAdd}>
          <Plus size={14} />
        </Btn>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  projectName,
  onEdit,
  onDelete,
}: {
  task: Task;
  projectName: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };
  const pri = PRIORITIES[task.priority] ?? PRIORITIES.normal;
  const due = dueLabel(task.due);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded-lg border border-line bg-panel2 p-2.5 active:cursor-grabbing hover:border-accent/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <button className="flex-1 text-left text-sm" onClick={onEdit}>
          {task.title}
        </button>
        <button className="text-dim hover:text-danger" title="删除" onClick={onDelete}>
          <Trash2 size={12} />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={pri.tone}>{pri.label}</Badge>
        {due.tone !== "muted" && <Badge tone={due.tone}>{due.text}</Badge>}
        {projectName && <Badge tone="dim">{projectName}</Badge>}
      </div>
    </div>
  );
}
