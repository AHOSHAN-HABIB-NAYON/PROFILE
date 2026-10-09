import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Icon, IconTile } from '../components/Icon';
import { LeagueEmblem } from '../components/LeagueEmblem';
import { BrandMark } from '../components/Splash';
import { setLang, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { useSettings } from '../lib/settings';

/* ───────────── Illustrations (hand-built from shapes + icons, animated with CSS) ───────────── */

function BattleArt() {
  return (
    <div className="intro-art art-battle" aria-hidden>
      <div className="ab-card">
        <div className="ab-live"><i /> LIVE</div>
        <div className="ab-players">
          <div className="ab-p left">
            <span className="ab-avatar a1">র</span>
            <b>2,450</b>
          </div>
          <div className="ab-vs"><Icon name="bolt" size={26} strokeWidth={2.6} /></div>
          <div className="ab-p right">
            <span className="ab-avatar a2">ক</span>
            <b>2,180</b>
          </div>
        </div>
        <div className="ab-q">
          <span className="ab-line w80" />
          <span className="ab-line w55" />
          <div className="ab-opts">
            <span className="ab-opt" />
            <span className="ab-opt ok"><Icon name="check" size={14} strokeWidth={3} /></span>
            <span className="ab-opt" />
            <span className="ab-opt" />
          </div>
        </div>
      </div>
      <span className="float-badge fb1"><Icon name="users" size={18} /> 1 VS 1</span>
      <span className="float-badge fb2"><Icon name="timer" size={18} /> 10s</span>
      <span className="float-badge fb3"><Icon name="fire" size={18} /> ×3</span>
    </div>
  );
}

function LearnArt() {
  return (
    <div className="intro-art art-learn" aria-hidden>
      <div className="al-book">
        <IconTile name="book-check" tone="primary" size={96} />
      </div>
      <span className="al-chip c1"><IconTile name="landmark" color="#1d4ed8" size={26} /> BCS</span>
      <span className="al-chip c2"><IconTile name="banknote" color="#15803d" size={26} /> ব্যাংক</span>
      <span className="al-chip c3"><IconTile name="cpu" color="#4f46e5" size={26} /> ICT</span>
      <span className="al-chip c4"><IconTile name="building" color="#0f766e" size={26} /> সরকারি চাকরি</span>
      <div className="al-answer">
        <Icon name="check-circle" size={20} />
        <div>
          <b>সঠিক উত্তর!</b>
          <span className="ab-line w80" />
        </div>
      </div>
    </div>
  );
}

function RankArt() {
  return (
    <div className="intro-art art-rank" aria-hidden>
      <div className="ar-podium">
        <div className="ar-col c2"><LeagueEmblem league="diamond" size={46} /><span>2</span></div>
        <div className="ar-col c1"><span className="ar-crown"><Icon name="crown" size={26} /></span><LeagueEmblem league="champion" size={58} /><span>1</span></div>
        <div className="ar-col c3"><LeagueEmblem league="gold" size={42} /><span>3</span></div>
      </div>
      <span className="ar-coin k1"><Icon name="coin" size={34} /></span>
      <span className="ar-coin k2"><Icon name="coin" size={26} /></span>
      <span className="ar-coin k3"><Icon name="xp" size={30} /></span>
      <span className="float-badge fb4"><Icon name="trophy" size={18} /> #1</span>
    </div>
  );
}

const SLIDES = [
  {
    Art: BattleArt,
    title: ['Real-time quiz battles', 'রিয়েলটাইম কুইজ ব্যাটল'],
    body: [
      'Battle friends or players across Bangladesh live — 1 VS 1, Duo, Squad or against the AI. Same question, fastest correct answer wins.',
      'বন্ধু বা সারা দেশের প্লেয়ারদের সাথে লাইভ লড়াই করুন — 1 VS 1, Duo, Squad কিংবা AI। একই প্রশ্ন, যে আগে সঠিক উত্তর দেবে সে-ই জিতবে।',
    ],
  },
  {
    Art: LearnArt,
    title: ['Prepare for your exams while you play', 'খেলতে খেলতে চাকরির প্রস্তুতি'],
    body: [
      'Thousands of hand-checked questions for BCS, bank, government jobs, ICT and more — every answer comes with a short explanation.',
      'BCS, ব্যাংক, সরকারি চাকরি, ICT সহ হাজারো বাছাই করা প্রশ্ন — প্রতিটি উত্তরের সাথে ছোট ব্যাখ্যা, যাতে খেলার সাথে শেখাও হয়।',
    ],
  },
  {
    Art: RankArt,
    title: ['Ranks, leagues and rewards', 'র‍্যাংক, লীগ আর পুরস্কার'],
    body: [
      'Earn XP and coins, climb from Bronze to Champion, complete missions and put your name on the national leaderboard.',
      'জিতে XP আর কয়েন অর্জন করুন, ব্রোঞ্জ থেকে চ্যাম্পিয়ন লীগে উঠুন, মিশন শেষ করে রিওয়ার্ড নিন আর জাতীয় লিডারবোর্ডে নাম তুলুন।',
    ],
  },
];

const AUTO_MS = 4800;

/** First-run intro: three auto-advancing pages, then "এগিয়ে যান" → sign in. */
export default function Intro() {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the visible slide from the scroll position (works with swipe and autoplay).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const on = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  // Autoplay; pauses while the player touches the carousel and resumes a few seconds later.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (paused.current || document.hidden) return;
      const el = track.current;
      if (!el) return;
      const cur = Math.round(el.scrollLeft / el.clientWidth);
      go(cur >= SLIDES.length - 1 ? 0 : cur + 1);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, []);

  const hold = () => {
    paused.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  };
  const release = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => (paused.current = false), 6000);
  };

  const proceed = () => {
    haptic('tap');
    useSettings.getState().set({ introSeen: true });
    const next = params.get('next');
    nav(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`, { replace: true });
  };

  return (
    <div className="intro">
      <header className="intro-top">
        <div className="brand">
          <BrandMark size={34} animate={false} />
          <span>QUIZ WAR<small>BANGLADESH</small></span>
        </div>
        <div className="lang-toggle" role="group" aria-label={t('Language', 'ভাষা')}>
          <button aria-pressed={lang === 'bn'} onClick={() => setLang('bn', false)}>বাংলা</button>
          <button aria-pressed={lang === 'en'} onClick={() => setLang('en', false)}>EN</button>
        </div>
      </header>

      <div
        ref={track}
        className="intro-track"
        role="region"
        aria-roledescription="carousel"
        aria-label={t('Why QUIZ WAR', 'কেন QUIZ WAR')}
        onPointerDown={hold}
        onPointerUp={release}
        onPointerCancel={release}
        onFocus={hold}
        onBlur={release}
      >
        {SLIDES.map(({ Art, title, body }, i) => (
          <section key={i} className={`intro-slide ${index === i ? 'active' : ''}`} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${SLIDES.length}`}>
            <Art />
            <div className="intro-text">
              <h1>{t(title[0], title[1])}</h1>
              <p>{t(body[0], body[1])}</p>
            </div>
          </section>
        ))}
      </div>

      <footer className="intro-foot">
        <div className="intro-dots" role="tablist" aria-label={t('Pages', 'পেজ')}>
          {SLIDES.map((_, i) => (
            <button key={i} role="tab" aria-selected={index === i} aria-label={`${i + 1}`} onClick={() => (hold(), go(i), release())}>
              <i className={index === i ? 'on' : ''} />
            </button>
          ))}
        </div>
        <button className="btn primary lg block intro-cta" onClick={proceed}>
          {t('Get started', 'এগিয়ে যান')} <Icon name="arrow-right" anim="bounce" />
        </button>
        <p className="xs faint center">{t('Free to play · Made in Bangladesh', 'সম্পূর্ণ ফ্রি · বাংলাদেশে তৈরি')}</p>
      </footer>
    </div>
  );
}
