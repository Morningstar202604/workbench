import type { ReactNode } from "react";
import type { WidgetId } from "../../lib/layout";
import {
  CategoryWidget,
  DiskWidget,
  KpiWidget,
  PortWidget,
  ResourceWidget,
  ServicesWidget,
  SessionsWidget,
  TasksWidget,
  TopProcessWidget,
} from "./widgets";

/**
 * 组件注册表：布局引擎只认 id，不认实现。
 * 单独成文件是为了让 widgets.tsx 只导出组件（Fast Refresh 要求）。
 */
export const WIDGET_COMPONENTS: Record<WidgetId, () => ReactNode> = {
  kpis: () => <KpiWidget />,
  resources: () => <ResourceWidget />,
  categories: () => <CategoryWidget />,
  disks: () => <DiskWidget />,
  ports: () => <PortWidget />,
  processes: () => <TopProcessWidget />,
  services: () => <ServicesWidget />,
  tasks: () => <TasksWidget />,
  sessions: () => <SessionsWidget />,
};
