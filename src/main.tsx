import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerServiceWorker } from './pwa';

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('В корневом HTML нет #root контейнера');
}

const root = createRoot(rootEl);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

void registerServiceWorker();
