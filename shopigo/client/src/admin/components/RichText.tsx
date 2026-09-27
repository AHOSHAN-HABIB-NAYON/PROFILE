import { useEffect, useRef, useState } from 'react';
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered, Underline } from 'lucide-react';
import { cx } from '../../lib/format';

/**
 * Lightweight rich-text editor (no heavy dependency). Output is sanitised on
 * the server with an allow-list before it is stored or shown to customers.
 */
export function RichText({ value, onChange, minHeight = 180 }: { value: string; onChange: (html: string) => void; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(false);
  useEffect(() => {
    if (ref.current && !source && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value, source]);
  const cmd = (name: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, arg);
    onChange(ref.current?.innerHTML ?? '');
  };
  const tools = [
    { icon: Bold, run: () => cmd('bold'), label: 'Bold' },
    { icon: Italic, run: () => cmd('italic'), label: 'Italic' },
    { icon: Underline, run: () => cmd('underline'), label: 'Underline' },
    { icon: Heading2, run: () => cmd('formatBlock', 'h3'), label: 'Heading' },
    { icon: List, run: () => cmd('insertUnorderedList'), label: 'Bullets' },
    { icon: ListOrdered, run: () => cmd('insertOrderedList'), label: 'Numbered' },
    { icon: Link2, run: () => { const u = prompt('Link URL (https://…)'); if (u && /^(https?:\/\/|\/)/.test(u)) cmd('createLink', u); }, label: 'Link' },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-soft/60 p-1.5">
        {tools.map((t) => <button key={t.label} type="button" title={t.label} disabled={source} onMouseDown={(e) => e.preventDefault()} onClick={t.run} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface disabled:opacity-40"><t.icon className="size-4" /></button>)}
        <button type="button" title="HTML" onClick={() => setSource(!source)} className={cx('ml-auto grid size-8 place-items-center rounded-lg hover:bg-surface', source ? 'bg-surface text-brand-600' : 'text-ink-2')}><Code className="size-4" /></button>
      </div>
      {source ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} className="block w-full resize-y bg-transparent p-3 font-mono text-[12.5px] outline-none" style={{ minHeight }} />
      ) : (
        <div ref={ref} contentEditable suppressContentEditableWarning onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)} className="prose-shop p-3 outline-none" style={{ minHeight }} />
      )}
    </div>
  );
}
