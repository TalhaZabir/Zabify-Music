import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './index.css';
import { applyApiBases, initThemeFromStorage, useSettings } from './stores/settings';

initThemeFromStorage();
applyApiBases(useSettings.getState());

const el = document.getElementById('root');
if (!el) throw new Error('Missing #root');
ReactDOM.createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
