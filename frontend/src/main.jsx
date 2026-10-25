import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';

const api = import.meta.env.VITE_API_URL || '';
const fMW = (value) => value == null ? '—' : `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} GW`;
const fNum = (value) => value == null ? '—' : new Intl.NumberFormat('en-GB').format(value);
const fTime = (value) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(value));

function Metric({ label, value, suffix, tone = 'text-white', hint }) {
  return <article className="min-h-30 bg-panel-light p-5">
    <div className="text-xs text-[#a5b7be]">{label}<span className="ml-2 cursor-help rounded-full border border-[#65818b] px-1 font-mono text-[10px] text-mint" title={hint}>i</span></div>
    <strong className={`my-3 block text-[27px] leading-none tracking-[-.05em] ${tone}`}>{value}</strong>
    <span className="font-mono text-[11px] text-[#849ba5]">{suffix}</span>
  </article>;
}

function App() {
  const [date, setDate] = useState('2026-01-15');
  const [cutoff, setCutoff] = useState('11');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`${api}/api/decision-view?delivery_date=${date}&cutoff_hour=${cutoff}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Unable to load source data'); return body; })
      .then((body) => { setData(body); setSelected(null); })
      .catch((fetchError) => { if (fetchError.name !== 'AbortError') setError(fetchError.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [date, cutoff]);

  const chartRows = useMemo(() => data?.points.map((point, index) => ({ ...point, label: index % 4 === 0 ? fTime(point.startTime) : '', time: fTime(point.startTime) })) || [], [data]);
  const metrics = data?.metrics;
  const current = selected ?? data?.points?.[0];
  const controlClass = 'rounded-md border border-[#385461] bg-ink px-3 py-2 text-[13px] text-[#e9f0f2] outline-none focus:border-mint';

  return <main className="mx-auto max-w-360 px-[5%] pb-14">
    <nav className="flex h-[82px] items-center justify-between border-b border-[#28414c]">
      <div className="text-sm font-extrabold tracking-[.12em]"><span className="mr-1 text-[22px] text-mint">◢</span> WINDLENS <em className="hidden font-mono text-[10px] not-italic text-[#8ca1ae] sm:inline">/ DAY-AHEAD DESK</em></div>
      <div className="hidden font-mono text-[10px] tracking-[.08em] text-[#b5c6ca] sm:block"><span className="mr-2 inline-block size-2 rounded-full bg-[#89dbbb] shadow-[0_0_12px_#89dbbb]"></span>ELEXON CONNECTED</div>
    </nav>

    <section className="flex min-h-73 items-center justify-between gap-6 py-8 lg:py-0">
      <div><p className="mb-3 font-mono text-[10px] tracking-[.15em] text-mint">GB NATIONAL WIND · JANUARY 2026 ARCHIVE</p><h1 className="m-0 text-[clamp(42px,5.1vw,70px)] font-extrabold leading-none tracking-[-.06em]">Buy with the forecast<br/><i className="font-serif font-semibold text-[#a8d9cd]">you actually had.</i></h1><p className="max-w-140 leading-relaxed text-[#a8b9c0]">Decision-time wind forecast evidence for day-ahead procurement. No hindsight, no black box.</p></div>
      <div className="hidden w-59 border-l border-amber bg-[#10232b] p-4 text-xs leading-relaxed text-[#b6c5c9] lg:block"><span className="block font-mono text-[10px] text-amber">DECISION LENS</span><b className="text-lg">← T-1 cutoff</b><p className="mb-0 mt-2">Every forecast is frozen at the selected market decision time before it is compared with outturn.</p></div>
    </section>

    <section className="flex flex-wrap items-end gap-3 rounded-[10px] border border-line bg-panel p-4" aria-label="Decision parameters">
      <label className="flex flex-col gap-1.5 font-mono text-[10px] tracking-[.06em] text-muted">Delivery day<input className={controlClass} type="date" min="2026-01-01" max="2026-01-31" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="flex flex-col gap-1.5 font-mono text-[10px] tracking-[.06em] text-muted">Forecast cutoff<select className={controlClass} value={cutoff} onChange={(event) => setCutoff(event.target.value)}><option value="9">09:00 UK time (T−1)</option><option value="11">11:00 UK time (T−1)</option><option value="13">13:00 UK time (T−1)</option><option value="17">17:00 UK time (T−1)</option></select></label>
      <div className="min-w-50 text-left text-xs sm:ml-auto sm:text-right">{data ? <><span className="block font-mono text-[9px] text-mint">AS-OF</span><b>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(data.cutoffTime))} UK</b></> : 'LOADING DECISION CONTEXT…'}</div>
    </section>

    {error && <section className="my-4 rounded-[10px] border border-line bg-panel-light p-6 text-amber"><b>Data source unavailable.</b> {error} <span className="ml-2 text-[#abc0c5]">Run with <code>DEMO_MODE=true</code> for an offline walkthrough.</span></section>}
    {loading && !data ? <section className="my-4 rounded-[10px] border border-line bg-panel-light p-6">Loading Elexon observations and forecast history…</section> : data && <>
      <section className="my-4 grid overflow-hidden rounded-[10px] border border-[#29414b] bg-[#29414b] sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Mean absolute error" value={`${fNum(metrics.maeMW)} MW`} suffix="typical miss" hint="Mean of absolute forecast errors." />
        <Metric label="Forecast bias" value={`${metrics.biasMW > 0 ? '+' : ''}${fNum(metrics.biasMW)} MW`} suffix={metrics.biasMW < 0 ? 'short on wind' : 'long on wind'} tone={metrics.biasMW < 0 ? 'text-amber' : 'text-mint'} hint="Forecast minus actual. Negative means wind was under-forecast." />
        <Metric label="P90 error" value={`${fNum(metrics.p90AbsoluteErrorMW)} MW`} suffix="risk guardrail" hint="90% of absolute errors were at or below this value." />
        <Metric label="Under-forecast" value={`${metrics.underForecastRate}%`} suffix={`${metrics.count} half-hours scored`} tone="text-amber" hint="Share of settlement periods where forecast was below actual." />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_295px]">
        <article className="overflow-hidden rounded-[10px] border border-line bg-panel">
          <header className="flex flex-col justify-between gap-3 p-5 pb-0 sm:flex-row"><div><p className="mb-2 font-mono text-[10px] tracking-[.15em] text-mint">DELIVERY SHAPE</p><h2 className="m-0 text-xl font-bold tracking-[-.04em]">Forecast versus actual wind</h2></div><div className="font-mono text-[11px] text-[#abbec4]"><span className="mr-1.5 inline-block w-4 border-t-[3px] border-dashed border-amber align-middle"></span>Forecast <span className="ml-3 mr-1.5 inline-block w-4 border-t-[3px] border-mint align-middle"></span>Actual</div></header>
          <div className="p-2 pt-4"><ResponsiveContainer width="100%" height={360}><ComposedChart data={chartRows} onClick={(state) => state?.activePayload && setSelected(state.activePayload[0].payload)}><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#88d8c0" stopOpacity=".35"/><stop offset="1" stopColor="#88d8c0" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#22333f"/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8ca1ae', fontSize: 11 }}/><YAxis tickFormatter={(value) => `${Math.round(value / 1000)}G`} tickLine={false} axisLine={false} tick={{ fill: '#8ca1ae', fontSize: 11 }} width={42}/><Tooltip contentStyle={{ background: '#10212b', border: '1px solid #365060', borderRadius: 8 }} labelFormatter={(_, rows) => rows?.[0]?.payload?.time || ''} formatter={(value, key) => [fMW(value), key === 'forecastMW' ? 'Forecast' : 'Actual']}/><Area type="monotone" dataKey="actualMW" stroke="#91e2c8" strokeWidth={2.5} fill="url(#fill)"/><Line type="monotone" dataKey="forecastMW" stroke="#ffd166" strokeWidth={2.5} strokeDasharray="7 5" dot={false}/></ComposedChart></ResponsiveContainer></div>
          <footer className="flex flex-col gap-1 px-5 pb-4 font-mono text-[10px] text-[#8199a3] sm:flex-row sm:justify-between"><span>Source: {data.source}</span><span>Hover or click a period to inspect it</span></footer>
        </article>
        <aside className="rounded-[10px] border border-line bg-panel p-5"><p className="mb-2 font-mono text-[10px] tracking-[.15em] text-mint">PROCUREMENT SIGNAL</p><h2 className="mb-5 text-[25px] font-bold tracking-[-.04em]">{current ? fTime(current.startTime) : 'Select a period'}</h2>{current && <><div className="flex justify-between border-t border-line py-3"><span className="text-xs text-[#9bb0b7]">Forecast wind</span><b>{fMW(current.forecastMW)}</b></div><div className="flex justify-between border-t border-line py-3"><span className="text-xs text-[#9bb0b7]">Actual wind</span><b>{fMW(current.actualMW)}</b></div><div className={`my-2 rounded px-2 py-2 text-center font-mono text-[11px] ${current.errorMW < 0 ? 'bg-[#4d3f23] text-[#ffdc80]' : 'bg-[#183f45] text-[#9ee9d0]'}`}>{current.errorMW > 0 ? '+' : ''}{fNum(current.errorMW)} MW {current.errorMW < 0 ? 'under-forecast' : 'over-forecast'}</div><hr className="my-4 border-0 border-t border-line"/><dl className="text-[11px] leading-relaxed"><dt className="mt-3 text-[#849aa4]">Forecast published</dt><dd className="m-0 text-[#d3e0e4]">{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(current.publishTime))} UK</dd><dt className="mt-3 text-[#849aa4]">Scoring convention</dt><dd className="m-0 text-[#d3e0e4]">Forecast − actual</dd><dt className="mt-3 text-[#849aa4]">Resolution</dt><dd className="m-0 text-[#d3e0e4]">30-minute outturn</dd></dl></>}<div className="mt-5 border-l-2 border-mint bg-[#112b33] p-3 text-[11px] leading-relaxed text-[#afc4c8]"><b className="text-[#d9ebea]">Decision aid, not an order.</b><br/>Use the error distribution to set your own reserve / risk tolerance alongside demand and price inputs.</div></aside>
      </section>

      <section className="mt-4 flex flex-col gap-6 rounded-[10px] bg-[#14343b] p-6 lg:flex-row lg:items-center"><div className="lg:w-[31%]"><p className="mb-2 font-mono text-[10px] tracking-[.15em] text-mint">AUDITABLE METHOD</p><h2 className="m-0 text-xl font-bold tracking-[-.04em]">How this screen avoids hindsight</h2></div><ol className="grid flex-1 grid-cols-2 gap-4 lg:grid-cols-4">{[['Freeze', 'Set delivery day and T−1 UK cutoff.'], ['Select', 'Take the latest WINDFOR run published by that cutoff.'], ['Score', 'Compare against FUELHH WIND actuals.'], ['Act', 'Use MAE, bias and P90 as a risk context.']].map(([title, detail]) => <li key={title} className="border-l border-[#54777b] pl-3"><b className="block text-mint">{title}</b><span className="mt-1 block text-[11px] leading-relaxed text-[#b3c6c9]">{detail}</span></li>)}</ol></section>
    </>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
