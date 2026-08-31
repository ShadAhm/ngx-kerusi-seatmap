import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
// The library's one stylesheet. Angular ships its component CSS inside the
// bundle; React has no equivalent, so consumers import this once.
import '@kerusiweb/react/styles.css';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
