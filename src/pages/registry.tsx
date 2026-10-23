import {
  Coins,
  Cpu,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Server,
  Settings as SettingsIcon,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { lazy, memo, type ComponentType } from "react";

/**
 * 页面注册表：导航项、图标、分组、懒加载组件、i18n key 的唯一来源。
 *
 * 分组（group）的意义：页面到 9 个之后，平铺侧边栏让用户每次都要扫一遍。
 * 按「概览 / 监控 / AI / 工作 / 系统」分组后，用户先认组再认项，扫视成本明显降低；
 * 窄屏下组可以整体折叠，只留当前组的项。
 */
export interface PageDef {
  key: string;
  icon: LucideIcon;
  group: PageGroupKey;
  load: () => Promise<{ default: ComponentType }>;
}

export type PageGroupKey = "monitor" | "ai" | "work" | "system";

export const PAGE_GROUPS: { key: PageGroupKey; label: string }[] = [
  { key: "monitor", label: "app.group.monitor" },
  { key: "ai", label: "app.group.ai" },
  { key: "work", label: "app.group.work" },
  { key: "system", label: "app.group.system" },
];

export const PAGES = [
  {
    key: "overview",
    icon: LayoutDashboard,
    group: "monitor",
    load: () => import("./Overview"),
  },
  { key: "processes", icon: Cpu, group: "monitor", load: () => import("./Processes") },
  { key: "servers", icon: Server, group: "monitor", load: () => import("./Servers") },
  { key: "ai", icon: Sparkles, group: "ai", load: () => import("./AiSessions") },
  { key: "costs", icon: Coins, group: "ai", load: () => import("./Costs") },
  {
    key: "projects",
    icon: FolderKanban,
    group: "work",
    load: () => import("./Projects"),
  },
  { key: "tasks", icon: ListChecks, group: "work", load: () => import("./Tasks") },
  {
    key: "settings",
    icon: SettingsIcon,
    group: "system",
    load: () => import("./Settings"),
  },
  { key: "logs", icon: FileText, group: "system", load: () => import("./Logs") },
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

/** 按分组聚合，供侧边栏渲染。 */
export function pagesByGroup(): { group: PageGroupKey; pages: PageDef[] }[] {
  return PAGE_GROUPS.map(({ key }) => ({
    group: key,
    pages: PAGES.filter((p) => p.group === key) as PageDef[],
  })).filter((g) => g.pages.length > 0);
}

/** 某个视图属于哪个组（用于折叠态高亮当前组）。 */
export function groupOf(view: ViewKey): PageGroupKey {
  const found = PAGES.find((p) => p.key === view);
  return found ? found.group : "monitor";
}

export const DEFAULT_VIEW: ViewKey = "overview";
