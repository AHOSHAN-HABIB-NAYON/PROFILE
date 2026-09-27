import { useEffect } from 'react';
import { Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { ApiError } from '../lib/api';
import { LangContext } from '../lib/i18n';
import { BootstrapProvider, useBootstrap } from '../lib/settings';
import { initTracking, track } from '../lib/tracking';
import { PageSpinner, Toaster } from '../components/ui';
import { BottomNav, DesktopHeader, Footer, WhatsAppFab } from './components/chrome';
import { MaintenanceScreen, ServerErrorScreen } from './pages/ErrorPages';

export default function StoreLayout() {
  const { data, error, isLoading, refetch } = useBootstrap();
  const { pathname } = useLocation();

  useEffect(() => {
    if (data?.settings && data.categories.length >= 0) initTracking(data.settings);
  }, [data]);
  useEffect(() => {
    if (data) track('page_view');
  }, [pathname, data]);
  useEffect(() => {
    if (data?.settings.primary_color && /^#[0-9a-f]{6}$/i.test(data.settings.primary_color) && data.settings.primary_color.toLowerCase() !== '#f26b3a') {
      document.documentElement.style.setProperty('--color-brand-500', data.settings.primary_color);
    }
  }, [data?.settings.primary_color]);

  if (error instanceof ApiError && error.code === 'NOT_INSTALLED') return <Navigate to="/install" replace />;
  if (error instanceof ApiError && error.code === 'MAINTENANCE') return <MaintenanceScreen />;
  if (!data && isLoading) return <PageSpinner />;
  if (!data) return <ServerErrorScreen onRetry={() => void refetch()} />;

  return (
    <BootstrapProvider value={data}>
      <LangContext.Provider value={data.settings.language === 'bn' ? 'bn' : 'en'}>
        <div className="min-h-screen">
          <DesktopHeader />
          <main className="mx-auto max-w-7xl pb-24 md:px-6 md:pb-6">
            <Outlet />
          </main>
          <Footer />
          <BottomNav />
          <WhatsAppFab />
          <Toaster />
        </div>
        <ScrollRestoration />
      </LangContext.Provider>
    </BootstrapProvider>
  );
}
