import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** ReactコンポーネントのエラーをキャッチしてフォールバックUIを表示 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-20 px-4">
          <p className="font-mono text-sm text-muted">
            データの表示中にエラーが発生しました
          </p>
          <button
            type="button"
            className="mt-4 font-mono text-[11px] text-muted border border-border rounded-sm px-4 py-2 cursor-pointer hover:text-ink hover:border-ink transition-all"
            onClick={() => window.location.reload()}
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
