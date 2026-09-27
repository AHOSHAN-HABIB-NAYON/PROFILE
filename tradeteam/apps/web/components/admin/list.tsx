'use client';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Card, ErrorBox } from '@/components/ui/primitives';
import { DataTable, Pagination, type Column } from '@/components/ui/table';

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Server-paginated admin list with filters. */
export function AdminList<T>({
  path,
  filters,
  columns,
  rowKey,
  onRowClick,
  toolbar,
  mobileTitle,
  queryKey,
}: {
  path: string;
  filters: Record<string, string | undefined>;
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  toolbar?: ReactNode;
  mobileTitle?: (r: T) => ReactNode;
  queryKey?: string;
}) {
  const [page, setPage] = useState(1);
  const key = JSON.stringify(filters);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setPage(1);
  }
  const q = useQuery({
    queryKey: ['admin', queryKey ?? path, filters, page],
    queryFn: () => get<ListResult<T>>(path, { ...filters, page, pageSize: 50 }),
  });
  return (
    <Card padded={false}>
      {toolbar && <div className="p-3 border-b border-line">{toolbar}</div>}
      {q.isError && (
        <div className="p-4">
          <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />
        </div>
      )}
      <DataTable
        rows={q.data?.items}
        loading={q.isLoading}
        columns={columns}
        rowKey={rowKey}
        onRowClick={onRowClick}
        mobileTitle={mobileTitle}
      />
      {q.data && (
        <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
      )}
    </Card>
  );
}
