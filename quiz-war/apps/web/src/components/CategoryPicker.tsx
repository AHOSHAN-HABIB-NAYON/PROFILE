import { useCategories } from '../hooks/queries';
import { useLang, useT } from '../lib/i18n';
import { categoryIcon, IconTile } from './Icon';

export function CategoryPicker({ value, onChange, allowAll = true }: { value: number | null; onChange: (id: number | null) => void; allowAll?: boolean }) {
  const { data } = useCategories();
  const t = useT();
  const lang = useLang();
  return (
    <div className="chips-scroll" role="listbox" aria-label={t('Category', 'ক্যাটাগরি')}>
      {allowAll && (
        <button type="button" role="option" aria-selected={value === null} className="select-chip" onClick={() => onChange(null)}>
          <IconTile name="sparkles" tone="accent" size={26} />
          {t('Mixed', 'মিশ্র')}
        </button>
      )}
      {(data ?? [])
        .filter((c) => c.questionCount > 0)
        .map((c) => (
          <button type="button" key={c.id} role="option" aria-selected={value === c.id} className="select-chip" onClick={() => onChange(c.id)}>
            <IconTile name={categoryIcon(c)} color={c.color} size={26} />
            {lang === 'bn' ? (c.nameBn ?? c.name) : c.name}
          </button>
        ))}
    </div>
  );
}
