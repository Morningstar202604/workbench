import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { t } from "./lib/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** 错误边界：捕获子组件渲染异常，显示友好提示并提供恢复按钮。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg p-10 text-center">
          <AlertTriangle size={40} className="text-danger" />
          <h2 className="text-lg font-semibold">{t("err.title")}</h2>
          <p className="max-w-md text-sm text-dim">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 rounded-[var(--radius-btn)] bg-accentsoft px-4 py-2 text-sm text-accent hover:bg-accent/20"
          >
            <RefreshCw size={14} />
            {t("err.retry")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
