import { useState } from 'react';

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

export default function MedicationLog({ meds = [] }) {
  const [taken, setTaken] = useState({});

  if (!meds.length) return <div className="empty-card">No medications listed.</div>;

  return (
    <div className="med-log-list">
      {meds.map(med => (
        <div key={med} className="med-card">
          <div>
            <strong>{med}</strong>
            <span>{taken[med] ? `✓ Taken at ${taken[med]}` : 'Not logged today'}</span>
          </div>
          <button onClick={() => setTaken(current => ({ ...current, [med]: nowLabel() }))}>
            {taken[med] ? 'Taken' : 'Mark as taken'}
          </button>
        </div>
      ))}
    </div>
  );
}
