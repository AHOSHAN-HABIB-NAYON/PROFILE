'use client';
import type { ReactNode } from 'react';
import { Button, Empty, Skeleton, cx } from './primitives';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
}

/**
 * Data table that turns into stacked cards on small screens (no horizontal scrolling of dense
 * tables on phones). Server-side pagination controls.
 */
export function DataTable<T>({
  rows,
  columns,
  loading,
  empty,
  onRowClick,
  rowKey,
  mobileTitle,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (r: T) => void;
  rowKey: (r: T) => string;
  mobileTitle?: (r: T) => ReactNode;
}) {
  if (loading && !rows)
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  if (!rows?.length) return <>{empty ?? <Empty title="Nothing here yet" />}</>;
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-muted text-left border-b border-line">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cx(
                    'font-medium px-4 py-2.5 whitespace-nowrap',
                    c.align === 'right' && 'text-right',
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx(
                  'border-b border-line last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-card-2',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      'px-4 py-3 num whitespace-nowrap',
                      c.align === 'right' && 'text-right',
                      c.className,
                    )}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-line">
        {rows.map((r) => (
          <div
            key={rowKey(r)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={cx('px-4 py-3', onRowClick && 'active:bg-card-2')}
          >
            {mobileTitle && <div className="font-semibold text-sm mb-1.5">{mobileTitle(r)}</div>}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="text-[12px] min-w-0">
                    <div className="text-muted">{c.header}</div>
                    <div className="num text-fg truncate">{c.render(r)}</div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-line text-[13px]">
      <span className="text-muted num">
        Page {page} of {pages} · {total.toLocaleString()} total
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
