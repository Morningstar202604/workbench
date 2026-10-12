import { forwardRef, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { Inbox } from "lucide-react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-panel shadow-[0_1px_3px_rgb(0_0_0/0.12)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold tracking-wide text-dim uppercase">{children}</h2>
      {extra}
    </div>
  );
}

const TONES: Record<string, string> = {
  accent: "text-accent border-accent/40 bg-accentsoft",
  ok: "text-ok border-ok/40 bg-ok/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  dim: "text-dim border-line bg-panel2",
};

export function Badge({
  children,
  tone = "dim",
  className = "",
}: {
  children: ReactNode;
  tone?: keyof typeof TONES | string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${TONES[tone] ?? TONES.dim} ${className}`}
    >
      {children}
    </span>
  );
}

type BtnProps = {
  children: ReactNode;
  onClick?: (e?: unknown) => void;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  title?: string;
  disabled?: boolean;
};

export function Btn({ children, onClick, variant = "ghost", className = "", title, disabled }: BtnProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40";
  const styles: Record<string, string> = {
    primary: "bg-accent text-black hover:opacity-85",
    ghost: "border border-line bg-panel2 text-text hover:border-accent/50",
    danger: "border border-danger/50 bg-danger/10 text-danger hover:bg-danger/20",
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-xl border border-line bg-panel shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-3 text-base font-semibold">{title}</div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** 数字滚动动画：目标值变化时从旧值平滑过渡到新值。 */
function useCountUp(target: number, duration = 600): number {
  const [val, setVal] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    prevRef.current = target;
    if (from === to) {
      setVal(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const STAT_TONES: Record<string, string> = {
  text: "text-text",
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

/** 全局统一的统计卡片：顶部彩条 + 图标 + 滚动数字 + 提示行。
 * 各页面的 StatCard / StatPill / SummaryCard / SummaryPill 均由此替代。 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text",
  bar = "bg-accent",
}: {
  icon: typeof Inbox;
  label: string;
  value: number | string;
  hint?: string;
  tone?: keyof typeof STAT_TONES | string;
  bar?: string;
}) {
  const color = STAT_TONES[tone] ?? STAT_TONES.text;
  const numeric = typeof value === "number";
  const shown = useCountUp(numeric ? value : 0);
  return (
    <Card className="card-hover relative overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${bar}`} />
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accentsoft">
          <Icon size={15} className={color} />
        </span>
        <span className="text-xs text-dim">{label}</span>
      </div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${color}`}>
        {numeric ? shown : value}
      </div>
      {hint && (
        <div className="mt-1 truncate text-[11px] text-dim" title={hint}>
          {hint}
        </div>
      )}
    </Card>
  );
}

export function Empty({ children, icon: Icon }: { children: ReactNode; icon?: typeof Inbox }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm text-dim">
      {Icon && <Icon size={20} className="opacity-60" />}
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-dim">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm text-text outline-none focus:border-accent/60";

export function Table({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-dim">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

type TrProps = HTMLAttributes<HTMLTableRowElement> & {
  /** 虚拟滚动实测高度用：@tanstack/react-virtual 按此值回读行高 */
  "data-index"?: number;
};

export const Tr = forwardRef<HTMLTableRowElement, TrProps>(function Tr(
  { children, className = "", onClick, ...rest },
  ref
) {
  return (
    <tr
      ref={ref}
      className={`border-b border-line/60 hover:bg-panel2/70 ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      {...rest}
    >
      {children}
    </tr>
  );
});

export function Td({
  children,
  className = "",
  mono = false,
  title,
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  mono?: boolean;
  title?: string;
  colSpan?: number;
}) {
  return (
    <td className={`px-3 py-2 align-middle ${mono ? "font-mono text-xs" : ""} ${className}`} title={title} colSpan={colSpan}>
      {children}
    </td>
  );
}
