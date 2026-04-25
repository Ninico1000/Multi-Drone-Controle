import React from 'react';
import { LanguageProvider } from './i18n';
import MultiDroneControl from './components/MultiDroneControl';
import './index.css';

function App() {
  return (
    <LanguageProvider>
      <MultiDroneControl />
    </LanguageProvider>
  );
}

export default App;
