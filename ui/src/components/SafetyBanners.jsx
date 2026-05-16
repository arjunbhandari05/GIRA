function toneFor(flag) {
  if (flag.severity === 'CRITICAL') return 'danger';
  if (flag.severity === 'WARNING') return 'warning';
  return 'success';
}

export default function SafetyBanners({ flags = [], compact = false }) {
  if (!flags.length) {
    return <div className="safety-banner success">✓ No critical flags</div>;
  }

  return (
    <div className={compact ? 'safety-list compact' : 'safety-list'}>
      {flags.map((flag, index) => (
        <div key={`${flag.rsid}-${flag.flag}-${index}`} className={`safety-banner ${toneFor(flag)}`}>
          <div className="safety-title">{flag.severity} · {flag.gene} · {flag.rsid}</div>
          <div>{flag.flag}</div>
          <small>{flag.action}</small>
        </div>
      ))}
    </div>
  );
}
