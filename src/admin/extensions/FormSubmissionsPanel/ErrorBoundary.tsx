import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'Error inesperado en el panel de envíos.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Strapi's error tracking picks this up via the normal React error path.
    console.error('[FormSubmissionsPanel]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '8px', color: '#d02b20', fontSize: '13px' }}>
          {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}
