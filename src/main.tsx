import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';
import { CloudGate } from './app/CloudGate';
import { cloudConfigured } from './data/cloud';
import { localBackend } from './data/backend';
import { initStore } from './data/store';

const root = createRoot(document.getElementById('root')!);
const isPortal = location.hash.startsWith('#/p/');

if (cloudConfigured && !isPortal) {
  root.render(<StrictMode><CloudGate><App /></CloudGate></StrictMode>);
} else {
  // Local mode (and cloud portal pages, which need no login or store).
  const boot = cloudConfigured ? Promise.resolve() : initStore(localBackend());
  boot.then(() => root.render(<StrictMode><App /></StrictMode>));
}
