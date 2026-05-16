function arrowFor(metric = {}) {
  if (metric.trend === 'improving') return '↗';
  if (metric.trend === 'declining') return '↘';
  return '→';
}

function MetricCard({ label, metric, unit }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{metric?.avg_30d ?? '—'}{unit}</strong>
      <small>{arrowFor(metric)} {metric?.trend || 'loading'} · {metric?.wow_pct ?? '—'}% WoW</small>
    </div>
  );
}

export default function MetricCards({ wearable }) {
  const metrics = wearable?.metrics || {};
  const hypo = Boolean(wearable?.hypoglycemia_signal);
  return (
    <div className="metrics-stack">
      <MetricCard label="HRV avg" metric={metrics.hrv_ms} unit=" ms" />
      <MetricCard label="RHR avg" metric={metrics.rhr_bpm} unit=" bpm" />
      <MetricCard label="Recovery avg" metric={metrics.recovery_score} unit="" />
      <div className={`hypo-badge ${hypo ? 'danger' : 'success'}`}>{hypo ? '⚠ Signal detected' : 'No signal'}</div>
    </div>
  );
}
