import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { useLang, useT } from "../lib/i18n";
import {
  allThemes,
  deriveTheme,
  describeTheme,
  findTheme,
  swatchOf,
} from "../lib/theme/presets";
import {
  buildTheme,
  contrastRatio,
  mix,
  type Density,
  type FontChoice,
  type Material,
  type ThemeInput,
} from "../lib/theme/tokens";
import { LAYOUTS, SHELLS, normalizeOrder, widgetOf, type WidgetId } from "../lib/layout";
import { Badge, Btn, Card, Field, Modal, SectionTitle, inputCls } from "../ui";

/**
 * 外观面板：主题（含自定义与导入导出）、外壳、概览版面、组件摆放。
 *
 * 拆成独立组件的原因：设置页本来就承担成本、数据、刷新等多块职责，
 * 主题编辑器有它自己的草稿状态（未保存的编辑不能直接作用到界面），
 * 混在设置页里会让那 500 行继续膨胀。
 */
export function AppearancePanel() {
  const t = useT();
  const lang = useLang();
  const {
    theme,
    customThemes,
    setTheme,
    upsertTheme,
    deleteTheme,
    importTheme,
    shell,
    setShell,
    layout,
    setLayout,
    widgetOrder,
    widgetHidden,
    setWidgetOrder,
    setWidgetHidden,
    resetWidgets,
    setToast,
  } = useStore(
    useShallow((s) => ({
      theme: s.theme,
      customThemes: s.customThemes,
      setTheme: s.setTheme,
      upsertTheme: s.upsertTheme,
      deleteTheme: s.deleteTheme,
      importTheme: s.importTheme,
      shell: s.shell,
      setShell: s.setShell,
      layout: s.layout,
      setLayout: s.setLayout,
      widgetOrder: s.widgetOrder,
      widgetHidden: s.widgetHidden,
      setWidgetOrder: s.setWidgetOrder,
      setWidgetHidden: s.setWidgetHidden,
      resetWidgets: s.resetWidgets,
      setToast: s.setToast,
    }))
  );

  const [editing, setEditing] = useState<ThemeInput | null>(null);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const themes = useMemo(() => allThemes(customThemes), [customThemes]);
  const current = findTheme(theme, customThemes);

  const duplicate = () => {
    const base = findTheme(theme, customThemes);
    const id = `custom-${Math.random().toString(36).slice(2, 8)}`;
    const copy = deriveTheme({ ...base, builtin: false }, `${base.name} copy`, id);
    setEditing(copy);
  };

  const exportTheme = () => {
    const data = JSON.stringify(current, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workbench-theme-${current.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(t("settings.themeExported"));
  };

  const importFromFile = async (file: File) => {
    const res = importTheme(await file.text());
    setToast(res.ok ? t("settings.themeImported") : res.error || "");
  };

  const move = (id: WidgetId, dir: -1 | 1) => {
    const order = normalizeOrder(widgetOrder);
    const idx = order.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    setWidgetOrder(order);
  };

  const toggleWidget = (id: WidgetId) => {
    setWidgetHidden(
      widgetHidden.includes(id)
        ? widgetHidden.filter((x) => x !== id)
        : [...widgetHidden, id]
    );
  };

  const dropOn = (target: WidgetId) => {
    if (!dragId || dragId === target) return;
    const order = normalizeOrder(widgetOrder);
    const from = order.indexOf(dragId);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragId);
    setWidgetOrder(order);
    setDragId(null);
  };

  return (
    <>
      <Card>
        <SectionTitle
          extra={
            <div className="flex items-center gap-1.5">
              <Btn
                className="!px-2 !py-1 !text-[11px]"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={12} /> {t("settings.themeImport")}
              </Btn>
              <Btn className="!px-2 !py-1 !text-[11px]" onClick={exportTheme}>
                <Download size={12} /> {t("settings.themeExport")}
              </Btn>
              <Btn
                variant="primary"
                className="!px-2 !py-1 !text-[11px]"
                onClick={duplicate}
              >
                <Plus size={12} /> {t("settings.themeNew")}
              </Btn>
            </div>
          }
        >
          {t("settings.themeSection")}
        </SectionTitle>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {themes.map((th) => {
            const active = theme === th.id;
            const [bg, panel, accent, text] = swatchOf(th);
            return (
              <div
                key={th.id}
                className={`group relative overflow-hidden rounded-[var(--radius-btn)] border text-left transition-colors ${
                  active ? "border-accent" : "border-line hover:border-accent/40"
                }`}
                style={{ background: panel }}
              >
                <button
                  type="button"
                  onClick={() => setTheme(th.id)}
                  aria-pressed={active}
                  aria-label={th.name}
                  className="block w-full text-left"
                >
                  {/* 迷你预览：三种形状直接反映主题的圆角与材质 */}
                  <div className="flex h-12 gap-1 p-1.5" style={{ background: bg }}>
                    <div
                      className="w-1/4"
                      style={{
                        background: panel,
                        borderRadius: Math.min(6, th.radiusBtn),
                        border: `1px solid ${mix(accent, bg, 0.7)}`,
                      }}
                    />
                    <div className="flex flex-1 flex-col justify-center gap-1">
                      <div
                        className="h-1 w-3/4"
                        style={{ background: text, opacity: 0.5, borderRadius: 2 }}
                      />
                      <div className="flex gap-1">
                        <div
                          className="h-4 flex-1"
                          style={{
                            background: panel,
                            border: `1px solid ${mix(accent, bg, 0.75)}`,
                            borderRadius: Math.min(8, th.radiusCard),
                          }}
                        />
                        <div
                          className="h-4 w-1/3"
                          style={{
                            background: accent,
                            opacity: 0.85,
                            borderRadius: Math.min(8, th.radiusBtn),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="px-2 py-1.5" style={{ background: panel }}>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate text-[11.5px] font-semibold"
                        style={{ color: text }}
                      >
                        {th.name}
                      </span>
                      {th.builtin ? (
                        <span
                          className="ml-auto h-1 w-1 rounded-full"
                          style={{ background: accent }}
                        />
                      ) : (
                        <span
                          className="ml-auto text-[9px]"
                          style={{ color: readableOn(text, panel, 4.6) }}
                        >
                          {t("settings.themeCustom")}
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-0.5 truncate text-[9.5px]"
                      style={{ color: readableOn(text, panel, 4.6) }}
                    >
                      {describeTheme(th)}
                    </div>
                  </div>
                </button>

                <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    title={t("settings.themeEdit")}
                    aria-label={t("settings.themeEdit")}
                    className="rounded bg-black/45 p-1 text-white backdrop-blur hover:bg-black/70"
                    onClick={() => setEditing({ ...th, builtin: false })}
                  >
                    <Pencil size={10} />
                  </button>
                  <button
                    type="button"
                    title={t("settings.themeNew")}
                    aria-label={t("settings.themeNew")}
                    className="rounded bg-black/45 p-1 text-white backdrop-blur hover:bg-black/70"
                    onClick={() => {
                      const id = `custom-${Math.random().toString(36).slice(2, 8)}`;
                      setEditing(
                        deriveTheme({ ...th, builtin: false }, `${th.name} copy`, id)
                      );
                    }}
                  >
                    <Copy size={10} />
                  </button>
                  {!th.builtin && (
                    <button
                      type="button"
                      title={t("settings.themeDelete")}
                      aria-label={t("settings.themeDelete")}
                      className="rounded bg-black/45 p-1 text-white backdrop-blur hover:bg-red-600/80"
                      onClick={() => {
                        deleteTheme(th.id);
                        setToast(t("settings.themeDeleted"));
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-2.5 text-[11px] leading-relaxed text-dim">
          {t("settings.themeHint")}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFromFile(f);
            e.target.value = "";
          }}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle>{t("settings.layoutSection")}</SectionTitle>

          <Field label={t("settings.layoutShell")}>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {SHELLS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-shell={s.id}
                  aria-pressed={shell === s.id}
                  onClick={() => setShell(s.id)}
                  className={`rounded-[var(--radius-btn)] border px-2.5 py-2 text-left transition-colors ${
                    shell === s.id
                      ? "border-accent bg-accent/8"
                      : "border-line hover:border-accent/40"
                  }`}
                >
                  <div className="text-[12px] font-medium">{s.name[lang]}</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-faint">
                    {s.hint[lang]}
                  </div>
                </button>
              ))}
            </div>
          </Field>

          <Field label={t("settings.layoutOverview")}>
            <div className="flex flex-wrap gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  data-layout={l.id}
                  aria-pressed={layout === l.id}
                  title={l.hint[lang]}
                  onClick={() => setLayout(l.id)}
                  className={`t-btn border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    layout === l.id
                      ? "border-accent bg-accent text-[var(--color-bg)]"
                      : "border-line bg-panel2/70 text-dim hover:text-text"
                  }`}
                >
                  {l.name[lang]}
                </button>
              ))}
            </div>
          </Field>
          <p className="text-[11px] leading-relaxed text-dim">
            {t("settings.layoutHint")}
          </p>
        </Card>

        <Card>
          <SectionTitle
            extra={
              <Btn className="!px-2 !py-1 !text-[11px]" onClick={resetWidgets}>
                <RotateCcw size={11} /> {t("settings.widgetsReset")}
              </Btn>
            }
          >
            {t("settings.widgetsSection")}
          </SectionTitle>

          <ul className="flex flex-col gap-1">
            {normalizeOrder(widgetOrder).map((id, i, arr) => {
              const w = widgetOf(id);
              const hidden = widgetHidden.includes(id);
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={() => setDragId(id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(id)}
                  className={`flex items-center gap-1.5 rounded-[var(--radius-btn)] border px-2 py-1.5 transition-colors ${
                    dragId === id
                      ? "border-accent bg-accent/8"
                      : "border-line/70 bg-panel2/40"
                  } ${hidden ? "opacity-45" : ""}`}
                >
                  <GripVertical size={12} className="shrink-0 cursor-grab text-faint" />
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    {w.name[lang]}
                  </span>
                  <Badge tone="dim">{w.span}/12</Badge>
                  <button
                    type="button"
                    className="rounded p-0.5 text-faint hover:text-text disabled:opacity-30"
                    title={t("settings.widgetsUp")}
                    aria-label={t("settings.widgetsUp")}
                    disabled={i === 0}
                    onClick={() => move(id, -1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-faint hover:text-text disabled:opacity-30"
                    title={t("settings.widgetsDown")}
                    aria-label={t("settings.widgetsDown")}
                    disabled={i === arr.length - 1}
                    onClick={() => move(id, 1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-faint hover:text-text"
                    title={hidden ? t("settings.widgetsShow") : t("settings.widgetsHide")}
                    aria-label={
                      hidden ? t("settings.widgetsShow") : t("settings.widgetsHide")
                    }
                    onClick={() => toggleWidget(id)}
                  >
                    {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            {t("settings.widgetsHint")}
          </p>
        </Card>
      </div>

      <ThemeEditor
        draft={editing}
        onCancel={() => setEditing(null)}
        onSave={(next) => {
          upsertTheme(next);
          setEditing(null);
          setToast(t("settings.themeSaved"));
        }}
      />
    </>
  );
}

// ── 主题编辑器 ─────────────────────────────────────────────

/**
 * 在给定底色上取一个「尽量接近 text 但至少满足 minRatio」的颜色。
 * 主题卡片的副标题用的是每套主题自己的底色，写死混合比例必然有主题不达标。
 */
function readableOn(text: string, bg: string, minRatio: number): string {
  if (contrastRatio(text, bg) >= minRatio) return text;
  for (let i = 70; i >= 0; i--) {
    const c = mix(text, bg, i / 100);
    if (contrastRatio(c, bg) >= minRatio) return c;
  }
  return text;
}

const DENSITIES: { id: Density; key: string }[] = [
  { id: "compact", key: "settings.densityCompact" },
  { id: "cozy", key: "settings.densityCozy" },
  { id: "roomy", key: "settings.densityRoomy" },
];

const FONTS: { id: FontChoice; key: string }[] = [
  { id: "sans", key: "settings.fontSans" },
  { id: "serif", key: "settings.fontSerif" },
  { id: "mono", key: "settings.fontMono" },
];

const MATERIALS: { id: Material; key: string }[] = [
  { id: "flat", key: "settings.materialFlat" },
  { id: "line", key: "settings.materialLine" },
  { id: "glass", key: "settings.materialGlass" },
];

function ThemeEditor({
  draft,
  onSave,
  onCancel,
}: {
  draft: ThemeInput | null;
  onSave: (t: ThemeInput) => void;
  onCancel: () => void;
}) {
  const t = useT();
  // 草稿状态放在这一层：Modal 的 footer 按钮和主体编辑的是同一份数据。
  // 用 draft.id 作为 key 让每次打开重置草稿——比 effect 同步更简单，
  // 也避免了「编辑到一半被外部 props 覆盖」这类经典问题。
  const [local, setLocal] = useState<ThemeInput | null>(draft);
  const [editingId, setEditingId] = useState<string | null>(draft?.id ?? null);

  if ((draft?.id ?? null) !== editingId) {
    setEditingId(draft?.id ?? null);
    setLocal(draft);
  }

  const patch = (p: Partial<ThemeInput>) => setLocal((d) => (d ? { ...d, ...p } : d));

  return (
    <Modal
      open={!!draft}
      title={t("settings.editorTitle")}
      onClose={onCancel}
      wide
      footer={
        <>
          <Btn onClick={onCancel}>{t("settings.editorCancel")}</Btn>
          <Btn variant="primary" onClick={() => local && onSave(local)}>
            {t("settings.editorSave")}
          </Btn>
        </>
      }
    >
      {local && <ThemeEditorBody draft={local} onPatch={patch} />}
    </Modal>
  );
}

/**
 * 编辑器主体。所有改动都先写进本地草稿（受控），
 * 只有「保存并应用」才落到 store —— 用户在调色时不该被半成品主题闪屏。
 */
function ThemeEditorBody({
  draft: local,
  onPatch: patch,
}: {
  draft: ThemeInput;
  onPatch: (p: Partial<ThemeInput>) => void;
}) {
  const t = useT();
  const tokens = buildTheme(local);

  const colorRow = (key: keyof ThemeInput, label: string) => (
    <label className="flex items-center gap-2">
      <input
        type="color"
        aria-label={label}
        value={String(local[key] ?? "#000000")}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<ThemeInput>)}
        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent"
      />
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-dim">{label}</span>
      <span className="num shrink-0 text-[10.5px] text-faint">
        {String(local[key] ?? "")}
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("settings.editorName")}>
        <input
          className={inputCls}
          value={local.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-dim">
            {t("settings.editorColors")}
          </div>
          <div className="flex flex-col gap-1.5">
            {colorRow("bg", t("settings.editorBg"))}
            {colorRow("panel", t("settings.editorPanel"))}
            {colorRow("text", t("settings.editorText"))}
            {colorRow("accent", t("settings.editorAccent"))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-[11.5px] text-dim">
            <input
              type="checkbox"
              checked={local.dark}
              onChange={(e) => patch({ dark: e.target.checked })}
            />
            {t("settings.editorDark")}
          </label>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-dim">
            {t("settings.editorShape")}
          </div>

          <label className="mb-2 block text-[11px] text-dim">
            {t("settings.editorRadius")} — {local.radiusCard}px
            <input
              type="range"
              min={0}
              max={24}
              value={local.radiusCard}
              onChange={(e) => patch({ radiusCard: Number(e.target.value) })}
              className="mt-1 w-full"
            />
          </label>
          <label className="mb-2 block text-[11px] text-dim">
            {t("settings.editorRadiusBtn")} — {local.radiusBtn}px
            <input
              type="range"
              min={0}
              max={20}
              value={local.radiusBtn}
              onChange={(e) => patch({ radiusBtn: Number(e.target.value) })}
              className="mt-1 w-full"
            />
          </label>
          <label className="mb-2 block text-[11px] text-dim">
            {t("settings.editorGrid")} — {Math.round(local.grid * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(local.grid * 100)}
              onChange={(e) => patch({ grid: Number(e.target.value) / 100 })}
              className="mt-1 w-full"
            />
          </label>
          <label className="mb-2 block text-[11px] text-dim">
            {t("settings.editorOpacity")} — {Math.round(local.panelOpacity * 100)}%
            <input
              type="range"
              min={20}
              max={100}
              value={Math.round(local.panelOpacity * 100)}
              onChange={(e) => patch({ panelOpacity: Number(e.target.value) / 100 })}
              className="mt-1 w-full"
            />
          </label>

          <div className="mt-2 flex flex-wrap gap-1">
            {DENSITIES.map((d) => (
              <Btn
                key={d.id}
                variant={local.density === d.id ? "primary" : "ghost"}
                className="!px-2 !py-0.5 !text-[11px]"
                onClick={() => patch({ density: d.id })}
              >
                {t(d.key)}
              </Btn>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {FONTS.map((f) => (
              <Btn
                key={f.id}
                variant={local.font === f.id ? "primary" : "ghost"}
                className="!px-2 !py-0.5 !text-[11px]"
                onClick={() => patch({ font: f.id })}
              >
                {t(f.key)}
              </Btn>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {MATERIALS.map((m) => (
              <Btn
                key={m.id}
                variant={local.material === m.id ? "primary" : "ghost"}
                className="!px-2 !py-0.5 !text-[11px]"
                onClick={() => patch({ material: m.id })}
              >
                {t(m.key)}
              </Btn>
            ))}
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[var(--radius-card)] border p-3"
        style={{
          background: local.bg,
          borderColor: tokens.vars["--color-line"],
          color: local.text,
          fontFamily: tokens.vars["--font-sans"],
        }}
      >
        <div
          className="mb-2 text-[10px] tracking-[0.1em]"
          style={{ color: tokens.vars["--color-faint"] }}
        >
          PREVIEW
        </div>
        <div className="flex gap-2">
          <div
            className="flex-1 p-2"
            style={{
              background: local.panel,
              borderRadius: local.radiusCard,
              border: `1px solid ${tokens.vars["--color-line"]}`,
            }}
          >
            <div className="text-[10.5px]" style={{ color: tokens.vars["--color-dim"] }}>
              {t("overview.statRunningProcs")}
            </div>
            <div
              className="num mt-1 text-[20px] font-semibold"
              style={{ color: local.accent, fontFamily: tokens.vars["--font-mono"] }}
            >
              42
            </div>
          </div>
          <div
            className="flex-1 p-2"
            style={{
              background: local.panel,
              borderRadius: local.radiusCard,
              border: `1px solid ${tokens.vars["--color-line"]}`,
            }}
          >
            <div className="text-[10.5px]" style={{ color: tokens.vars["--color-dim"] }}>
              {t("overview.statDevServers")}
            </div>
            <div
              className="num mt-1 text-[20px] font-semibold"
              style={{
                color: tokens.vars["--color-ok"],
                fontFamily: tokens.vars["--font-mono"],
              }}
            >
              3
            </div>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5">
          <span
            className="px-2 py-0.5 text-[10.5px]"
            style={{
              background: local.accent,
              color: local.bg,
              borderRadius: local.radiusBtn,
            }}
          >
            Primary
          </span>
          <span
            className="px-2 py-0.5 text-[10.5px]"
            style={{
              border: `1px solid ${tokens.vars["--color-line"]}`,
              color: local.text,
              borderRadius: local.radiusBtn,
            }}
          >
            Secondary
          </span>
        </div>
      </div>
    </div>
  );
}
