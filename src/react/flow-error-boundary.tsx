/**
 * FlowErrorBoundary — Catches render errors in flow components and
 * displays a minimal fallback UI instead of crashing the host app.
 *
 * Successful component libraries never let a visualization bug take down
 * the entire page. This boundary wraps FlowProgress and related components
 * so consumers get graceful degradation.
 */

import React from 'react';

export interface FlowErrorBoundaryProps {
  /** Content to render when an error occurs. If omitted, a default message is shown. */
  fallback?: React.ReactNode;
  /** Called when an error is caught, for logging/reporting. */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class FlowErrorBoundary extends React.Component<FlowErrorBoundaryProps, State> {
  static displayName = 'FlowErrorBoundary';

  constructor(props: FlowErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      return (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400"
          role="alert"
        >
          <p className="font-medium">Flow component error</p>
          <p className="mt-1 text-xs text-red-400/70">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
