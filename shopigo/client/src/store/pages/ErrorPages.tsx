import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Ban, CloudOff, RefreshCw, ShieldAlert, Timer, Wrench } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui';

function Screen({ icon, code, title, text, action }: { icon: React.ReactNode; code?: string; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 grid size-20 place-items-center rounded-[28px] bg-gradient-to-br from-brand-50 to-brand-100 text-brand-500 shadow-[var(--shadow-soft)]">{icon}</div>
        {code && <p className="text-[13px] font-extrabold tracking-[0.3em] text-brand-500">{code}</p>}
        <h1 className="mt-1 text-[24px] font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-[14.5px] text-muted">{text}</p>
        <div className="mt-6 flex justify-center gap-3">{action ?? <Link to="/"><Button>Go to Home</Button></Link>}</div>
      </div>
    </div>
  );
}

export function ForbiddenScreen() {
  return <Screen icon={<ShieldAlert className="size-9" />} code="403" title="Access denied" text="You don't have permission to view this page." />;
}
export function TooManyScreen() {
  return <Screen icon={<Timer className="size-9" />} code="429" title="Slow down a little" text="Too many requests in a short time. Please wait a minute and try again." action={<Button onClick={() => location.reload()} icon={<RefreshCw className="size-4" />}>Try again</Button>} />;
}
export function ServerErrorScreen({ onRetry }: { onRetry?: () => void }) {
  return <Screen icon={<CloudOff className="size-9" />} code="500" title="Something went wrong" text="We couldn't load this page. Please check your connection and try again." action={<Button onClick={() => (onRetry ? onRetry() : location.reload())} icon={<RefreshCw className="size-4" />}>Try again</Button>} />;
}
export function MaintenanceScreen() {
  const s = window.__SG_BOOT__?.settings;
  return <Screen icon={<Wrench className="size-9" />} title={s?.maintenance_title || "We're upgrading ShopiGo."} text={s?.maintenance_message || 'Please wait a moment.'} action={<Button onClick={() => location.reload()} icon={<RefreshCw className="size-4" />}>Refresh</Button>} />;
}

/** Router-level error boundary. Never shows stack traces to customers. */
export function RouteError() {
  const err = useRouteError();
  const status = isRouteErrorResponse(err) ? err.status : err instanceof ApiError ? err.status : 500;
  if (import.meta.env.DEV) console.error(err);
  // Stale chunk after a deploy → reload once to fetch the new build.
  if (err instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed/.test(err.message)) {
    if (!sessionStorage.getItem('sg_reloaded')) { sessionStorage.setItem('sg_reloaded', '1'); location.reload(); return null; }
  }
  if (status === 404) return <Screen icon={<Ban className="size-9" />} code="404" title="Page not found" text="The page you're looking for doesn't exist or has moved." />;
  if (status === 403) return <ForbiddenScreen />;
  if (status === 429) return <TooManyScreen />;
  if (status === 503) return <MaintenanceScreen />;
  return <ServerErrorScreen />;
}
