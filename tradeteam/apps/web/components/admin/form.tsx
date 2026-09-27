'use client';
import { useState, type ReactNode } from 'react';
import { Button, Input, Select, Toggle } from '@/components/ui/primitives';

export type FieldDef =
  | {
      name: string;
      label: string;
      type?: 'text' | 'number' | 'decimal';
      hint?: string;
      placeholder?: string;
      required?: boolean;
    }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { name: string; label: string; type: 'bool'; hint?: string };

type Values = Record<string, string | boolean | number | null | undefined>;

/** Small schema-driven form used by admin create/edit sheets. The server validates everything. */
export function SimpleForm({
  fields,
  initial,
  onSubmit,
  submitLabel = 'Save',
  busy,
  extra,
}: {
  fields: FieldDef[];
  initial: Values;
  onSubmit: (v: Values) => void;
  submitLabel?: string;
  busy?: boolean;
  extra?: ReactNode;
}) {
  const [v, setV] = useState<Values>(initial);
  return (
    <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), onSubmit(v))}>
      {fields.map((f) =>
        f.type === 'bool' ? (
          <Toggle
            key={f.name}
            checked={Boolean(v[f.name])}
            onChange={(x) => setV({ ...v, [f.name]: x })}
            label={f.label}
            description={f.hint}
          />
        ) : f.type === 'select' ? (
          <Select
            key={f.name}
            label={f.label}
            value={String(v[f.name] ?? '')}
            onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            key={f.name}
            label={f.label}
            hint={f.hint}
            placeholder={f.placeholder}
            required={f.required}
            inputMode={f.type === 'decimal' || f.type === 'number' ? 'decimal' : undefined}
            value={String(v[f.name] ?? '')}
            onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
          />
        ),
      )}
      {extra}
      <Button type="submit" block size="lg" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** Converts form strings to API payload: numbers for 'number' fields, null for empty optional decimals. */
export function normalize(fields: FieldDef[], v: Values, opts: { nullEmpty?: string[] } = {}) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const x = v[f.name];
    if (f.type === 'number') out[f.name] = x === '' || x === undefined || x === null ? undefined : Number(x);
    else if (x === '' && opts.nullEmpty?.includes(f.name)) out[f.name] = null;
    else if (x === '' || x === undefined) continue;
    else out[f.name] = x;
  }
  return out;
}
