
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Simple root Error Boundary using a Class Component (standard React error handling)
class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("CRITICAL UI ERROR:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          backgroundColor: '#0f172a',
          color: '#f43f5e',
          padding: '40px',
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', borderBottom: '1px solid #1e293b', paddingBottom: '20px', marginBottom: '20px' }}>
            SYSTEM_ERROR: INTERFACE_CRASHED
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '10px' }}>The neural network encountered an unexpected instruction:</p>
          <pre style={{
            backgroundColor: '#020617',
            padding: '20px',
            borderRadius: '12px',
            overflow: 'auto',
            border: '1px solid #1e293b'
          }}>
            {this.state.error?.stack || this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '40px',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              alignSelf: 'flex-start'
            }}
          >
            REBOOT SYSTEM
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);
