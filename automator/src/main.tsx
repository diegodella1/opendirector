import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#ff4444', fontFamily: 'monospace', background: '#1a1a2e', height: '100vh' }}>
          <h1 style={{ color: '#fff', marginBottom: 16 }}>OpenDirector Automator - Error</h1>
          <p style={{ marginBottom: 8 }}>{this.state.error.message}</p>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#aaa' }}>
            {this.state.error.stack}
          </pre>
          <p style={{ marginTop: 16, color: '#888' }}>Press Ctrl+Shift+I to open DevTools for more info.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (e) {
  // If React fails to even mount, show error in the DOM
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding:32px;color:#ff4444;font-family:monospace">
      <h1 style="color:#fff">Fatal Error</h1>
      <pre>${e instanceof Error ? e.message + '\n' + e.stack : String(e)}</pre>
    </div>`;
  }
}
