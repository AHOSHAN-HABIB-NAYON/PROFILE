import { useQuery } from '@tanstack/react-query';
import { HBars, LineChart, StackedBars } from '../components/Charts';
import { Loading } from '../components/ui';
import { api } from '../lib/api';

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return <div className="card kpi"><div className="label">{label}</div><div className="value">{typeof value === 'number' ? value.toLocaleString() : value}</div>{sub && <div className="sub">{sub}</div>}</div>;
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard'), refetchInterval: 30_000 });
  if (isLoading) return <Loading rows={8} />;
  if (error || !data) return <p className="err">{(error as Error)?.message ?? 'Failed to load'}</p>;
  const t = data.totals;
  const days = data.series.map((s: any) => ({ ...s, day: String(s.day).slice(0, 10) }));
  return (
    <>
      <div className="head"><h1>Dashboard</h1><span className="small faint">Auto-refreshes every 30s</span></div>
      <div className="grid kpis">
        <Kpi label="Total users" value={t.totalUsers} sub={`+${t.newUsersToday} in 24h`} />
        <Kpi label="Online now" value={t.onlineUsers} sub={`${t.queue} in matchmaking`} />
        <Kpi label="Games (24h)" value={t.gamesToday} />
        <Kpi label="Battles (24h)" value={t.battlesToday} sub="player vs player" />
        <Kpi label="AI matches (24h)" value={t.aiMatchesToday} />
        <Kpi label="Live matches" value={t.liveMatches} />
        <Kpi label="Active questions" value={t.questions} />
        <Kpi label="Active streaks" value={t.activeStreaks} />
        <Kpi label="Open reports" value={t.openReports} sub={`${t.flaggedMatches7d} flagged matches (7d)`} />
        <Kpi label="D1 retention" value={data.retention.d1 == null ? '—' : `${data.retention.d1}%`} sub={`cohort ${data.retention.cohort}`} />
      </div>
      <div className="grid two mt">
        <section className="card"><h2>New users</h2><p className="small faint">Last 14 days</p><LineChart label="New users" data={days.map((d: any) => ({ x: d.day, y: d.users }))} /></section>
        <section className="card"><h2>Active players</h2><p className="small faint">Players with at least one match per day</p><LineChart label="Active players" data={days.map((d: any) => ({ x: d.day, y: d.active }))} /></section>
        <section className="card"><h2>Matches per day</h2><p className="small faint">Finished matches by type</p><StackedBars series={['Player vs player', 'AI']} data={days.map((d: any) => ({ x: d.day, a: d.pvp, b: d.ai }))} /></section>
        <section className="card"><h2>Top categories</h2><p className="small faint">Matches, last 30 days</p>{data.categories.length ? <HBars data={data.categories.map((c: any) => ({ label: c.name, value: c.games }))} /> : <p className="muted small">No category matches yet.</p>}</section>
      </div>
      <section className="card mt">
        <h2>Server health</h2>
        <div className="row mt small">
          <span className="badge green">API up {Math.floor(data.server.uptimeSec / 3600)}h {Math.floor((data.server.uptimeSec % 3600) / 60)}m</span>
          <span className="badge">RSS {data.server.rssMb} MB</span>
          <span className="badge">Heap {data.server.heapMb} MB</span>
          <span className="badge">Node {data.server.node}</span>
          <span className={`badge ${data.server.redis ? 'green' : 'amber'}`}>Redis {data.server.redis ? 'connected' : 'not configured'}</span>
          <span className="badge">Revenue: monetization not enabled</span>
        </div>
      </section>
    </>
  );
}
