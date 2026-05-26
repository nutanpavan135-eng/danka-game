import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

    // Localhost testing should always show the newest Vite files, not an old PWA cache.
    if (isLocalDev) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => null);
      if ('caches' in window) caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => null);
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA registration failure should never block the live game.
    });
  });
}
