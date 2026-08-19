"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { PluginHostError, type PluginHostFailureCategory } from "./pluginHostRuntime";

interface PluginErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  onError?: (category: PluginHostFailureCategory, error: Error) => void;
}

interface PluginErrorBoundaryState {
  error: Error | null;
}

export default class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  state: PluginErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    const category = error instanceof PluginHostError ? error.category : "render";
    this.props.onError?.(category, error);
  }

  componentDidUpdate(previousProps: PluginErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      const category =
        this.state.error instanceof PluginHostError ? this.state.error.category : "render";
      return (
        <div
          role="alert"
          data-plugin-error-category={category}
          className="flex min-h-[60vh] items-center justify-center p-4 text-sm text-text-muted"
        >
          Plugin unavailable ({category})
        </div>
      );
    }
    return this.props.children;
  }
}
