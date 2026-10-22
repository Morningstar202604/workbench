import { useCallback, useEffect, useState } from "react";
import { Power } from "lucide-react";
import { autostart } from "../lib/autostart";
import { useT } from "../lib/i18n";
import { Badge, Card, SectionTitle } from "../ui";

/**
 * 开机自启开关。
 *
 * 状态来自操作系统（见 lib/autostart），不是本地布尔：用户可能在
 * 任务管理器里直接禁用，重开设置页必须反映真实情况。
 * 切换时先乐观更新，失败回滚并显示原因 —— 注册表写入可能因权限被拒。
 */
export function AutostartCard() {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const read = useCallback(async () => {
    try {
      const state = await autostart.read();
      if (state === null) {
        setSupported(false);
        return;
      }
      setEnabled(state);
      setError("");
    } catch (e) {
      setError(t("settings.autostartFailed", { err: String(e) }));
    }
  }, [t]);

  useEffect(() => {
    // setState 落在 IPC await 之后，不在同步渲染路径上
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 见上
    void read();
  }, [read]);

  if (!supported) {
    return (
      <Card>
        <SectionTitle>{t("settings.autostart")}</SectionTitle>
        <p className="text-[11.5px] leading-relaxed text-faint">
          {t("settings.autostartDesktopOnly")}
        </p>
      </Card>
    );
  }

  const toggle = async () => {
    if (enabled === null || busy) return;
    const next = !enabled;
    setBusy(true);
    setEnabled(next);
    try {
      await autostart.write(next);
      setError("");
    } catch (e) {
      setEnabled(!next);
      setError(t("settings.autostartFailed", { err: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle
        extra={
          <Badge tone={enabled ? "ok" : "dim"}>
            {enabled ? t("settings.autostartOn") : t("settings.autostartOff")}
          </Badge>
        }
      >
        <span className="flex items-center gap-1.5">
          <Power size={14} /> {t("settings.autostart")}
        </span>
      </SectionTitle>

      <button
        type="button"
        role="switch"
        aria-checked={enabled === true}
        disabled={enabled === null || busy}
        onClick={() => void toggle()}
        className={`flex w-full items-center justify-between gap-3 rounded-[var(--radius-btn)] border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50 ${
          enabled ? "border-accent/50 bg-accent/8" : "border-line bg-panel2/50"
        }`}
      >
        <span>{enabled ? t("settings.autostartOn") : t("settings.autostartOff")}</span>
        <span
          className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-accent" : "bg-line"
          }`}
          aria-hidden="true"
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-[var(--color-bg)] transition-[left] ${
              enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      {error && (
        <p className="mt-2 rounded-[var(--radius-btn)] border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
          {error}
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-dim">
        {t("settings.autostartHint")}
      </p>
    </Card>
  );
}
