'use client';
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaSeries, createChart, type UTCTimestamp } from 'lightweight-charts';
import { get } from '@/lib/api';
import { theme } from '@/lib/theme';
import { Skeleton } from '@/components/ui/primitives';

export function PerformanceChart({ range = '30d', height = 160 }: { range?: string; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ['portfolio', 'performance', range],
    queryFn: () => get<{ points: { time: number; value: string }[] }>('/portfolio/performance', { range }),
  });
  useEffect(() => {
    if (!el.current || !q.data?.points.length) return;
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--accent').trim();
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: cs.getPropertyValue('--chart-text').trim(),
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
      crosshair: { horzLine: { visible: false } },
    });
    const s = chart.addSeries(AreaSeries, {
      lineColor: accent,
      topColor: accent + '40',
      bottomColor: accent + '00',
      lineWidth: 2,
      priceLineVisible: false,
    });
    s.setData(q.data.points.map((p) => ({ time: p.time as UTCTimestamp, value: Number(p.value) })));
    chart.timeScale().fitContent();
    const un = theme.subscribe(() =>
      requestAnimationFrame(() => {
        const a = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        s.applyOptions({ lineColor: a, topColor: a + '40', bottomColor: a + '00' });
      }),
    );
    return () => {
      un();
      chart.remove();
    };
  }, [q.data]);
  if (q.isLoading) return <Skeleton className="w-full" />;
  if (!q.data?.points.length)
    return (
      <div className="text-[13px] text-muted flex items-center justify-center" style={{ height }}>
        Performance history appears after your first hourly snapshot.
      </div>
    );
  return <div ref={el} style={{ height }} />;
}
