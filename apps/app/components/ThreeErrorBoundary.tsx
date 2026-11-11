import { Component, type ReactNode } from 'react';

/**
 * Keeps a failed 3D view (no WebGL, too many contexts, lost context) from
 * taking down the screen around it: the view is replaced by `fallback`.
 */
export default class ThreeErrorBoundary extends Component<
  { fallback: (error: Error) => ReactNode; children: ReactNode; label?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label ?? 'ThreeErrorBoundary'}] 3D view failed to start:`, error);
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
