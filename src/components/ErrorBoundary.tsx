import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Uncaught rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#0d0f14",
            color: "#e2e8f0",
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            padding: 32,
            overflow: "auto",
            zIndex: 99999,
          }}
        >
          <h2 style={{ color: "#f87171", margin: "0 0 16px", fontSize: 18 }}>
            Application Error
          </h2>
          <p style={{ color: "#94a3b8", margin: "0 0 16px" }}>
            An unexpected error occurred. Please reload the application.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            Reload
          </button>
          <details open style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", color: "#94a3b8" }}>
              Error Details
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: "#1e1e2e",
                borderRadius: 6,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#f87171",
              }}
            >
              {this.state.error?.toString()}
            </pre>
            {this.state.errorInfo?.componentStack && (
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: "#1e1e2e",
                  borderRadius: 6,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: "#64748b",
                }}
              >
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
