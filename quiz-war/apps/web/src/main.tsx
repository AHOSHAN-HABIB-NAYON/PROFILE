import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { queryClient } from './lib/query';
import { registerRealtime } from './lib/realtime';
import { applyTheme, useSettings } from './lib/settings';
import { initPlatformInfo } from './lib/platform';
import '@fontsource/hind-siliguri/bengali-400.css';
import '@fontsource/hind-siliguri/bengali-500.css';
import '@fontsource/hind-siliguri/bengali-600.css';
import '@fontsource/hind-siliguri/bengali-700.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './styles/app.css';

const s = useSettings.getState();
applyTheme(s.theme, s.reduceMotion);
registerRealtime();
void initPlatformInfo();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
