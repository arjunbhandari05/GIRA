import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function rowsFor(wearable, metricKey) {
  const dates = wearable?.raw_series?.dates || [];
  const values = wearable?.raw_series?.[metricKey] || [];
  return dates.map((date, index) => ({ date: date.slice(5), value: values[index] }));
}

function MetricChart({ wearable, metricKey, title, color }) {
  const rows = rowsFor(wearable, metricKey);
  const avg = wearable?.metrics?.[metricKey]?.avg_30d;

  if (!rows.length) return <div className="empty-card">No {title} data yet.</div>;

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: -12 }}>
          <XAxis dataKey="date" minTickGap={18} tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={40} domain={['dataMin - 2', 'dataMax + 2']} />
          <Tooltip contentStyle={{ background: '#13131a', border: '1px solid #2c2c38', borderRadius: 12, color: '#e2e8f0' }} />
          {avg !== undefined && <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="4 4" />}
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function WearableCharts({ wearable }) {
  return (
    <div className="charts-stack">
      <MetricChart wearable={wearable} metricKey="hrv_ms" title="HRV · 30 days" color="#6366f1" />
      <MetricChart wearable={wearable} metricKey="recovery_score" title="Recovery score" color="#22c55e" />
    </div>
  );
}
