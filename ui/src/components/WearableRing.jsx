const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toneFromMetric(metric = {}) {
  const wow = Number(metric.wow_pct ?? 0);
  if (metric.trend === 'declining' && wow <= -10) return 'danger';
  if (metric.trend === 'declining') return 'warning';
  return 'success';
}

export default function WearableRing({ label, value, metric, unit = '', progressValue }) {
  const tone = toneFromMetric(metric);
  const progress = clamp(Number(progressValue ?? value ?? 50), 0, 100);
  const dash = (progress / 100) * CIRCUMFERENCE;

  return (
    <div className="ring-card">
      <svg viewBox="0 0 112 112" aria-label={`${label} ${value}${unit}`}>
        <circle cx="56" cy="56" r={RADIUS} className="ring-track" />
        <circle
          cx="56"
          cy="56"
          r={RADIUS}
          className={`ring-progress ${tone}`}
          strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
          transform="rotate(-90 56 56)"
        />
        <text x="56" y="53" textAnchor="middle" className="ring-value">{value ?? '—'}</text>
        <text x="56" y="70" textAnchor="middle" className="ring-unit">{unit}</text>
      </svg>
      <strong>{label}</strong>
      <span>{metric?.trend || 'loading'}</span>
    </div>
  );
}
