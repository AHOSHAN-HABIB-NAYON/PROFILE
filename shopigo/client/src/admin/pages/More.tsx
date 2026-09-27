import { Link } from 'react-router';
import { NAV_GROUPS, useAllowed } from '../AdminLayout';
import { PageHeader } from '../components/kit';

/** Mobile "More" tab: every admin section as app-style tiles. */
export default function More() {
  const allowed = useAllowed();
  return (
    <div>
      <PageHeader title="More" />
      <div className="space-y-5">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter(allowed);
          if (!items.length) return null;
          return (
            <section key={g.title}>
              <p className="mb-2 px-1 text-[11px] font-bold tracking-wider text-muted uppercase">{g.title}</p>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {items.map((it) => (
                  <Link key={it.to} to={it.to} className="card flex flex-col items-center gap-2 p-3 text-center">
                    <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-600"><it.icon className="size-5" /></span>
                    <span className="text-[12px] leading-tight font-semibold">{it.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
