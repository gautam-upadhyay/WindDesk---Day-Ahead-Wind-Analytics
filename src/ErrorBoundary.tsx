import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Do not expose exception details or account data in the public UI.
    console.error("WindDesk could not render a section.");
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="error-state" role="alert">
        <h2>{this.props.label ?? "This section could not open"}</h2>
        <p>
          A component failed to load or render. Reload to fetch the current
          application files. Your saved decisions remain in this browser.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={16} /> Reload application
        </button>
      </section>
    );
  }
}
