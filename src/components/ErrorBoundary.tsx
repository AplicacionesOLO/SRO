import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack?: string } | null;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isChunkError: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorMessage = error?.message || '';
    const isChunkError =
      errorMessage.includes('Failed to fetch dynamically imported module') ||
      errorMessage.includes('error loading dynamically imported module') ||
      errorMessage.includes('Loading chunk') ||
      errorMessage.includes('Loading CSS chunk');

    return { hasError: true, isChunkError };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    this.setState({
      error,
      errorInfo
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const { isChunkError, error } = this.state;

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <i className="ri-error-warning-line text-red-600 text-3xl"></i>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Ocurrió un error</h1>
                <p className="text-gray-600">La aplicación encontró un problema inesperado</p>
              </div>
            </div>

            {isChunkError && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <i className="ri-refresh-line text-amber-600 text-xl mt-0.5"></i>
                  <div>
                    <p className="font-semibold text-amber-800">La aplicación fue actualizada</p>
                    <p className="text-amber-700 text-sm mt-1">
                      Parece que el sistema se actualizó mientras estabas usando la app.
                      Recargá la página para obtener la última versión.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Mensaje de error:</h2>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-mono text-sm">{error.message}</p>
              </div>
            </div>

            {error.stack && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Stack trace:</h2>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto max-h-64">
                  <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap">
                    {error.stack}
                  </pre>
                </div>
              </div>
            )}

            {this.state.errorInfo?.componentStack && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Component stack:</h2>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto max-h-64">
                  <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="w-full bg-teal-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              {isChunkError ? 'Recargar página para actualizar' : 'Recargar aplicación'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
