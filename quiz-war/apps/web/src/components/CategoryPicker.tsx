import { useCategories } from '../hooks/queries';

export function CategoryPicker({ value, onChange, allowAll = true }: { value: number | null; onChange: (id: number | null) => void; allowAll?: boolean }) {
  const { data } = useCategories();
  return (
    <div className="tabs" role="listbox" aria-label="Category" style={{ background: 'transparent', padding: 0 }}>
      {allowAll && (
        <button type="button" role="option" aria-selected={value === null} className="chip" style={chipStyle(value === null)} onClick={() => onChange(null)}>
          🎲 Mixed
        </button>
      )}
      {(data ?? []).filter((c) => c.questionCount > 0).map((c) => (
        <button type="button" key={c.id} role="option" aria-selected={value === c.id} className="chip" style={chipStyle(value === c.id)} onClick={() => onChange(c.id)}>
          {c.icon} {c.nameBn ?? c.name}
        </button>
      ))}
    </div>
  );
}

const chipStyle = (on: boolean): React.CSSProperties => ({
  height: 34,
  border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
  background: on ? 'var(--primary-soft)' : 'var(--surface)',
  color: on ? 'var(--primary)' : 'var(--text-2)',
  flex: '0 0 auto',
});
