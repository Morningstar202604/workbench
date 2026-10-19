import { lazy, memo, type ComponentType } from "react";
import {
  Cpu,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Server,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";

/**
 * 页面注册表：导航项、图标、懒加载组件、i18n key 的唯一来源。
 *
 * 原先这三份信息以三个平行列表存在（NAV_KEYS / NAV_ICONS / 渲染分支），
 * 加一个页面要改四处，漏改渲染分支不会报错 —— 导航可见但点进去是空白。
 * 现在 ViewKey 由本表派生，新增页面只需加一条记录。
 */
export interface PageDef {
  /** 同时用作 ViewKey、i18n key 后缀（app.nav.* / app.title.*） */
  key: string;
  icon: ComponentType<{ size?: number }>;
  load: () => Promise<{ default: ComponentType }>;
}

export const PAGES = [
  {
    key: "overview",
    icon: LayoutDashboard,
    load: () => import("./Overview"),
  },
  { key: "processes", icon: Cpu, load: () => import("./Processes") },
  { key: "servers", icon: Server, load: () => import("./Servers") },
  { key: "ai", icon: Sparkles, load: () => import("./AiSessions") },
  { key: "projects", icon: FolderKanban, load: () => import("./Projects") },
  { key: "tasks", icon: ListChecks, load: () => import("./Tasks") },
  { key: "settings", icon: SettingsIcon, load: () => import("./Settings") },
  { key: "logs", icon: FileText, load: () => import("./Logs") },
] as const satisfies readonly PageDef[];

export type ViewKey = (typeof PAGES)[number]["key"];

/**
 * 惰性加载并 memo。memo 的意义：App 自己订阅的字段（loading / toast …）
 * 变化时，页面自身订阅的切片若没变就不该跟着重渲染。
 */
export const PAGE_COMPONENTS: Record<ViewKey, ComponentType> = PAGES.reduce(
  (acc, page) => {
    acc[page.key] = memo(lazy(page.load));
    return acc;
  },
  {} as Record<ViewKey, ComponentType>
);

export const DEFAULT_VIEW: ViewKey = "overview";
