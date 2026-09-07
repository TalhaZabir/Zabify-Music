import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
          <h2 className="text-lg font-semibold text-ink">Something went wrong.</h2>
          <p className="max-w-md text-sm text-ink-secondary">This section failed to load, but the rest of Zabify is still running.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
