import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';

const api = import.meta.env.VITE_API_URL || '';
const fMW = (value) => value == null ? '—' : `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} GW`;
const fNum = (value) => value == null ? '—' : new Intl.NumberFormat('en-GB').format(value);
const fTime = (value) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(value));

function Metric({ label, value, suffix, tone, hint }) {
  return <article className="metric"><div className="metric-label">{label}<span className="info" title={hint}>i</span></div><strong className={tone || ''}>{value}</strong><span className="metric-suffix">{suffix}</span></article>;
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
      .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.detail || 'Unable to load source data'); return body; })
      .then(body => { setData(body); setSelected(null); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [date, cutoff]);

  const chartRows = useMemo(() => data?.points.map((p, index) => ({ ...p, label: index % 4 === 0 ? fTime(p.startTime) : '', time: fTime(p.startTime) })) || [], [data]);
  const m = data?.metrics;
  const current = selected ?? data?.points?.[0];

  return <main>
    <nav><div className="brand"><span className="brand-mark">◢</span> WINDLENS <em>/ DAY-AHEAD DESK</em></div><div className="status"><span></span> ELEXON CONNECTED</div></nav>
    <section className="hero"><div><p className="eyebrow">GB NATIONAL WIND · JANUARY 2026 ARCHIVE</p><h1>Buy with the forecast<br/><i>you actually had.</i></h1><p className="subhead">Decision-time wind forecast evidence for day-ahead procurement. No hindsight, no black box.</p></div><div className="hero-note"><span>DECISION LENS</span><b>← T-1 cutoff</b><p>Every forecast is frozen at the selected market decision time before it is compared with outturn.</p></div></section>
    <section className="controls" aria-label="Decision parameters"><label>Delivery day<input type="date" min="2026-01-01" max="2026-01-31" value={date} onChange={e => setDate(e.target.value)} /></label><label>Forecast cutoff<select value={cutoff} onChange={e => setCutoff(e.target.value)}><option value="9">09:00 UK time (T−1)</option><option value="11">11:00 UK time (T−1)</option><option value="13">13:00 UK time (T−1)</option><option value="17">17:00 UK time (T−1)</option></select></label><div className="decision-stamp">{data ? <><span>AS-OF</span><b>{new Intl.DateTimeFormat('en-GB', {dateStyle:'medium', timeStyle:'short', timeZone:'Europe/London'}).format(new Date(data.cutoffTime))} UK</b></> : 'LOADING DECISION CONTEXT…'}</div></section>
    {error && <section className="error"><b>Data source unavailable.</b> {error} <span>Run with <code>DEMO_MODE=true</code> for an offline walkthrough.</span></section>}
    {loading && !data ? <section className="loading">Loading Elexon observations and forecast history…</section> : data && <>
      <section className="metrics"><Metric label="Mean absolute error" value={`${fNum(m.maeMW)} MW`} suffix="typical miss" hint="Mean of absolute forecast errors."/><Metric label="Forecast bias" value={`${m.biasMW > 0 ? '+' : ''}${fNum(m.biasMW)} MW`} suffix={m.biasMW < 0 ? 'short on wind' : 'long on wind'} tone={m.biasMW < 0 ? 'warn' : 'good'} hint="Forecast minus actual. Negative means wind was under-forecast."/><Metric label="P90 error" value={`${fNum(m.p90AbsoluteErrorMW)} MW`} suffix="risk guardrail" hint="90% of absolute errors were at or below this value."/><Metric label="Under-forecast" value={`${m.underForecastRate}%`} suffix={`${m.count} half-hours scored`} tone="warn" hint="Share of settlement periods where forecast was below actual."/></section>
      <section className="workspace"><article className="chart-card"><header><div><p className="eyebrow">DELIVERY SHAPE</p><h2>Forecast versus actual wind</h2></div><div className="legend"><span className="forecast-dot"></span> Forecast <span className="actual-dot"></span> Actual</div></header><div className="chart-wrap"><ResponsiveContainer width="100%" height={360}><ComposedChart data={chartRows} onClick={state => state?.activePayload && setSelected(state.activePayload[0].payload)}><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#88d8c0" stopOpacity=".35"/><stop offset="1" stopColor="#88d8c0" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#22333f"/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fill:'#8ca1ae',fontSize:11}}/><YAxis tickFormatter={v => `${Math.round(v/1000)}G`} tickLine={false} axisLine={false} tick={{fill:'#8ca1ae',fontSize:11}} width={42}/><Tooltip contentStyle={{background:'#10212b',border:'1px solid #365060',borderRadius:8}} labelFormatter={(_, rows) => rows?.[0]?.payload?.time || ''} formatter={(v, key) => [fMW(v), key === 'forecastMW' ? 'Forecast' : 'Actual']}/><Area type="monotone" dataKey="actualMW" stroke="#91e2c8" strokeWidth={2.5} fill="url(#fill)"/><Line type="monotone" dataKey="forecastMW" stroke="#ffd166" strokeWidth={2.5} strokeDasharray="7 5" dot={false}/></ComposedChart></ResponsiveContainer></div><footer><span>Source: {data.source}</span><span>Hover or click a period to inspect it</span></footer></article>
      <aside className="inspector"><p className="eyebrow">PROCUREMENT SIGNAL</p><h2>{current ? current.time || fTime(current.startTime) : 'Select a period'}</h2>{current && <><div className="signal"><span>Forecast wind</span><b>{fMW(current.forecastMW)}</b></div><div className="signal"><span>Actual wind</span><b>{fMW(current.actualMW)}</b></div><div className={`error-pill ${current.errorMW < 0 ? 'negative' : ''}`}>{current.errorMW > 0 ? '+' : ''}{fNum(current.errorMW)} MW {current.errorMW < 0 ? 'under-forecast' : 'over-forecast'}</div><hr/><dl><dt>Forecast published</dt><dd>{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(current.publishTime))} UK</dd><dt>Scoring convention</dt><dd>Forecast − actual</dd><dt>Resolution</dt><dd>30-minute outturn</dd></dl></>}<div className="callout"><b>Decision aid, not an order.</b><br/>Use the error distribution to set your own reserve / risk tolerance alongside demand and price inputs.</div></aside></section>
      <section className="method"><div><p className="eyebrow">AUDITABLE METHOD</p><h2>How this screen avoids hindsight</h2></div><ol><li><b>Freeze</b><span>Set delivery day and T−1 UK cutoff.</span></li><li><b>Select</b><span>Take the latest WINDFOR run published by that cutoff.</span></li><li><b>Score</b><span>Compare against FUELHH WIND actuals.</span></li><li><b>Act</b><span>Use MAE, bias and P90 as a risk context.</span></li></ol></section>
    </>}
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
