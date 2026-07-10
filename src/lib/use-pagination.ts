import { useEffect, useState } from "react";

export function usePagination<T>(items: T[], defaultPageSize = 10) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [items.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const from = items.length === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const to = Math.min(pageSafe * pageSize, items.length);
  const paged = items.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return { pageSize, setPageSize, page: pageSafe, setPage, totalPages, paged, from, to, total: items.length };
}
