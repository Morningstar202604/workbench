import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles/global.css";
import { useStore } from "./lib/store";
import { syncDocumentLang } from "./lib/i18n";

// 启动时同步持久化的主题到 <html data-theme>
const theme = useStore.getState().theme;
document.documentElement.dataset.theme = theme;
syncDocumentLang();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
