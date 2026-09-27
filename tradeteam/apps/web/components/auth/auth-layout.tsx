'use client';
import type { ReactNode } from 'react';
import { Brand } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/app-shell';
import { useSetting } from '@/lib/hooks';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const siteName = useSetting('site.name', 'TradeTeam');
  return (
    <div className="min-h-dvh flex flex-col pt-safe">
      <header className="h-16 px-5 flex items-center justify-between max-w-6xl w-full mx-auto">
        <Brand name={siteName} />
        <ThemeToggle />
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-10">
        <div className="w-full max-w-[420px] page-enter">
          <div className="sm:bg-card sm:border sm:border-line sm:shadow-card sm:rounded-3xl sm:p-8 pt-6">
            <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted mt-1.5 text-[15px]">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="text-center text-sm text-muted mt-6">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
