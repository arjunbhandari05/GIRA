export default function Spinner({ label = 'Loading…', full = false }) {
  return (
    <div className={full ? 'spinner-panel full' : 'spinner-panel'} role="status" aria-live="polite">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}
