import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles/global.css";
import { useStore } from "./lib/store";
import { syncDocumentLang } from "./lib/i18n";
import { applyTheme } from "./lib/theme/apply";

// 启动时同步持久化的风格到 <html data-theme>
applyTheme(useStore.getState().theme);
syncDocumentLang();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
