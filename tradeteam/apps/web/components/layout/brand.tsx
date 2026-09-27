'use client';
import Link from 'next/link';
import { useId } from 'react';

export function Logo({ size = 28 }: { size?: number }) {
  const id = `ttg${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22c58b" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill={`url(#${id})`} />
      <path
        d="M9 20.5 14 15l3.5 3.2L23 11.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="11.5" r="1.8" fill="#fff" />
    </svg>
  );
}

export function Brand({ name = 'TradeTeam', href = '/' }: { name?: string; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-bold text-[17px] tracking-tight text-fg">
      <Logo />
      <span>{name}</span>
    </Link>
  );
}
