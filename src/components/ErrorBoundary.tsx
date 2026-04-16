import React, { ErrorInfo, ReactNode } from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<any, State> {
  public state: State = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    let message = error.message;
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error) {
        message = parsed.error;
      }
    } catch (e) {
      // Not JSON
    }
    return { hasError: true, errorMessage: message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center p-6">
          <div className="bg-surface p-6 rounded-3xl max-w-md w-full border border-red-500/30 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-red-400 mb-2">Algo salió mal</h2>
            <p className="text-sm text-text/80 mb-6 break-words">{this.state.errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-primary text-bg font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
