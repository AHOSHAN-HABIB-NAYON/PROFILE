import { useCallback } from 'react';

/** Copies each column's <th> text into its cells' `data-label`, used by the phone card layout. */
function label(root: ParentNode) {
  root.querySelectorAll('table').forEach((table) => {
    const heads = Array.from(table.tHead?.rows[0]?.cells ?? [], (th) => th.textContent?.trim() ?? '');
    if (!heads.length) return;
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        let col = 0;
        for (const cell of Array.from(row.cells)) {
          const text = cell.colSpan > 1 ? '' : heads[col] ?? '';
          if (cell.dataset.label !== text) cell.dataset.label = text;
          col += cell.colSpan;
        }
      }
    }
  });
}

/**
 * Callback ref for the page container: labels every table cell now and whenever the DOM changes.
 * MutationObserver callbacks run before the next paint, so labels never flash in late.
 */
export function useTableLabels() {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    label(el);
    const obs = new MutationObserver(() => label(el));
    obs.observe(el, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, []);
}
