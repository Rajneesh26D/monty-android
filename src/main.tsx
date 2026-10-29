import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './Monty';
import './styles.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="loading">
        <h1>Something went wrong</h1>
        <p>Your saved data remains on this device.</p>
        <button className="primary" onClick={() => location.reload()}>
          Reopen app
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
