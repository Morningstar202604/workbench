import OverviewPage from "./overview/OverviewPage";

/**
 * 概览页入口。
 *
 * 排版与各组件拆在 `pages/overview/`：布局引擎（谁在哪、多大）和组件
 * （画什么）分开，才能让用户自己换版面、拖顺序，而不需要改组件代码。
 */
export default function Overview() {
  return <OverviewPage />;
}
