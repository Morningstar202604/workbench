import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { Btn, Modal } from "../ui";

/** 结束进程的二次确认框。不可逆操作，必须走 Modal 而不是 window.confirm。 */
export function KillDialog() {
  const t = useT();
  const { killTarget, setKillTarget, killProcess } = useStore(
    useShallow((s) => ({
      killTarget: s.killTarget,
      setKillTarget: s.setKillTarget,
      killProcess: s.killProcess,
    }))
  );
  return (
    <Modal
      open={!!killTarget}
      title={t("app.kill.title")}
      onClose={() => setKillTarget(null)}
      footer={
        <>
          <Btn onClick={() => setKillTarget(null)}>{t("app.kill.cancel")}</Btn>
          <Btn variant="danger" onClick={() => killTarget && killProcess(killTarget.pid)}>
            {t("app.kill.confirm", { pid: killTarget?.pid ?? "" })}
          </Btn>
        </>
      }
    >
      <p className="text-sm text-dim">
        {t("app.kill.body", {
          name: killTarget?.name ?? "",
          pid: killTarget?.pid ?? "",
        })}
      </p>
    </Modal>
  );
}

/** 底部 toast。 */
export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      className="animate-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-panel2/95 px-4 py-1.5 text-[12.5px] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur"
      role="status"
      aria-live="polite"
    >
      {toast}
    </div>
  );
}
