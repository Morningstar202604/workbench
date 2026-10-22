import { isTauri } from "./api";

/**
 * 开机自启。
 *
 * 不把状态放进 zustand persist：注册项属于操作系统，用户可以在任务管理器
 * / 系统设置里直接关掉。本地存一份只会与真实状态漂移，界面显示「已开启」
 * 而重启后并没有启动，是比没有开关更糟的失败方式。
 *
 * 演示模式（浏览器预览）没有 Tauri 宿主，插件命令会抛错，因此直接返回
 * null 让调用方渲染「仅桌面端可用」。
 */
export interface AutostartApi {
  read(): Promise<boolean | null>;
  write(on: boolean): Promise<boolean | null>;
}

const desktop = () => typeof window !== "undefined" && isTauri();

export const autostart: AutostartApi = {
  async read() {
    if (!desktop()) return null;
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return isEnabled();
  },
  async write(on) {
    if (!desktop()) return null;
    const { enable, disable } = await import("@tauri-apps/plugin-autostart");
    if (on) await enable();
    else await disable();
    return on;
  },
};
