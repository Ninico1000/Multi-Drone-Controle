import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { LanguageProvider } from './i18n';
import MultiDroneControl from './components/MultiDroneControl';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <MultiDroneControl />
    </LanguageProvider>
  </React.StrictMode>
);
