import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  /** Optional route name for logging context */
  routeName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Route-level error boundary with structured logging and recovery options.
 * Wraps individual route components to prevent full-app crashes.
 */
export default class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Structured error logging
    const logEntry = {
      timestamp: new Date().toISOString(),
      route: this.props.routeName || window.location.pathname,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack?.split("\n").slice(0, 5).join("\n"),
      },
      componentStack: errorInfo.componentStack?.split("\n").slice(0, 8).join("\n"),
      userAgent: navigator.userAgent,
    };

    console.error("[RouteErrorBoundary]", JSON.stringify(logEntry, null, 2));

    // Persist to localStorage for debugging
    try {
      const existing = JSON.parse(localStorage.getItem("dalam_error_log") || "[]");
      existing.unshift(logEntry);
      // Keep only last 10 errors
      localStorage.setItem("dalam_error_log", JSON.stringify(existing.slice(0, 10)));
    } catch {
      // Ignore storage errors
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV !== "production";

    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center px-4">
          <div className="max-w-lg w-full rounded-2xl border border-border bg-card p-8 text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                Something went wrong
              </h2>
              <p className="text-sm text-muted-foreground">
                This section encountered an error. You can try again or go back to the home page.
              </p>
            </div>

            {isDev && this.state.error && (
              <details className="text-left bg-muted/50 rounded-lg p-3 text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Error Details (dev only)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all text-destructive/80">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack?.split("\n").slice(0, 5).join("\n")}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="gap-2"
              >
                <Home className="w-4 h-4" />
                Home
              </Button>
              <Button onClick={this.handleRetry} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
