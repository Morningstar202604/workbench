import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles/global.css";
import { useStore } from "./lib/store";
import { syncDocumentLang } from "./lib/i18n";
import { applyTheme } from "./lib/theme/apply";
import { tokensFor } from "./lib/theme/presets";

// 启动时把持久化的主题 / 外壳 / 布局同步到 <html>
const boot = useStore.getState();
applyTheme(tokensFor(boot.theme, boot.customThemes), boot.shell, boot.layout);
syncDocumentLang();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
