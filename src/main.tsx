import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerServiceWorker } from './pwa';
import ErrorBoundary from './components/ErrorBoundary';

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error);
});

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('No #root container in root HTML');
}

const root = createRoot(rootEl);

root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

void registerServiceWorker();
