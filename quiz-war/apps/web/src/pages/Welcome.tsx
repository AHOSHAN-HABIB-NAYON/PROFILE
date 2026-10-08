import { Link, useSearchParams } from 'react-router';
import { GoogleButton, PasskeyButton } from './Auth';

export default function Welcome() {
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  return (
    <div className="welcome">
      <div className="welcome-art">
        <img src="/icons/icon-512.png" alt="QUIZ WAR logo" width={108} height={108} />
        <h1>QUIZ <span>WAR</span></h1>
        <p className="muted bn">বাংলাদেশের রিয়েলটাইম কুইজ ব্যাটল</p>
        <div className="welcome-features">
          <span className="chip primary">⚔️ 1 VS 1</span>
          <span className="chip accent">👥 Duo & Squad</span>
          <span className="chip success">🤖 AI Battles</span>
          <span className="chip warning">🏆 Leagues</span>
        </div>
      </div>
      <div className="col">
        <GoogleButton next={next} />
        <PasskeyButton next={next} />
        <Link to={`/register?next=${encodeURIComponent(next)}`} className="btn primary lg block">Create account with Email</Link>
        <p className="center small muted mt">
          Already playing? <Link to={`/login?next=${encodeURIComponent(next)}`} className="bold">Sign in</Link>
        </p>
        <p className="center xs faint">
          By continuing you agree to the <Link to="/legal/terms">Terms</Link> and <Link to="/legal/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
