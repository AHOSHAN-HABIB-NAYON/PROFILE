import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { cx } from '../../lib/format';
import { img, srcSet } from '../../lib/image';
import { useT } from '../../lib/i18n';
import type { Banner } from '../../lib/types';

function href(b: Banner): string | null {
  if (!b.link_value) return null;
  if (b.link_type === 'product') return `/product/${b.link_value}`;
  if (b.link_type === 'category') return `/category/${b.link_value}`;
  if (b.link_type === 'url') return b.link_value;
  return null;
}

export function BannerSlider({ banners }: { banners: Banner[] }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    if (banners.length < 2) return;
    const id = setInterval(() => {
      if (paused.current || document.hidden) return;
      const el = track.current;
      if (!el) return;
      const next = (index + 1) % banners.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 4500);
    return () => clearInterval(id);
  }, [index, banners.length]);

  if (!banners.length) return null;
  return (
    <div className="relative" onPointerEnter={() => (paused.current = true)} onPointerLeave={() => (paused.current = false)}>
      <div ref={track} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded-[26px]">
        {banners.map((b, i) => {
          const link = href(b);
          const content = (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[26px] bg-soft sm:aspect-[21/8]">
              <picture>
                {b.mobile_image && <source media="(max-width: 640px)" type="image/avif" srcSet={srcSet(b.mobile_image, 'avif', ['md', 'lg'])} />}
                {b.mobile_image && <source media="(max-width: 640px)" type="image/webp" srcSet={srcSet(b.mobile_image, 'webp', ['md', 'lg'])} />}
                <source type="image/avif" srcSet={srcSet(b.image, 'avif', ['md', 'lg'])} sizes="(max-width: 1280px) 100vw, 1280px" />
                <source type="image/webp" srcSet={srcSet(b.image, 'webp', ['md', 'lg'])} sizes="(max-width: 1280px) 100vw, 1280px" />
                <img src={img(b.image, 'lg')} alt={b.title ?? ''} className="size-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} />
              </picture>
              {(b.title || b.subtitle) && (
                <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-[#fff4ea]/95 via-[#fff4ea]/70 to-transparent p-5 sm:p-10">
                  {b.subtitle && <p className="max-w-[60%] text-[11px] font-semibold tracking-wide text-brand-700 uppercase sm:text-[13px]">{b.subtitle}</p>}
                  {b.title && <h2 className="mt-1 max-w-[62%] text-[21px] leading-[1.1] font-extrabold tracking-tight text-ink sm:text-[40px]">{b.title}</h2>}
                  {link && (
                    <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-b from-brand-400 to-brand-500 px-4 py-2 text-[12.5px] font-bold text-white shadow-[var(--shadow-float)] sm:mt-5 sm:px-6 sm:py-3 sm:text-[14px]">
                      {b.button_text || t('shopNow')} <ArrowRight className="size-3.5" />
                    </span>
                  )}
                </div>
              )}
            </div>
          );
          return (
            <div key={b.id} className="w-full shrink-0 snap-center">
              {link ? (link.startsWith('http') ? <a href={link} target="_blank" rel="noopener noreferrer">{content}</a> : <Link to={link}>{content}</Link>) : content}
            </div>
          );
        })}
      </div>
      {banners.length > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button key={b.id} aria-label={`Slide ${i + 1}`} onClick={() => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: 'smooth' })} className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-brand-500' : 'w-1.5 bg-[#e3d4c7]')} />
          ))}
        </div>
      )}
    </div>
  );
}
