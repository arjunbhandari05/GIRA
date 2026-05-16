import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPatients, getSafety, getWearable } from '../api.js';
import MedicationLog from '../components/MedicationLog.jsx';
import SafetyBanners from '../components/SafetyBanners.jsx';
import Spinner from '../components/Spinner.jsx';
import WearableRing from '../components/WearableRing.jsx';

function patientId(patient) {
  return patient?.patient_id || patient?.id || '';
}

function daysUntil(iso) {
  if (!iso) return '—';
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '—';
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.max(0, Math.ceil((end - start) / 86400000));
}

export default function PatientView() {
  const { patientId: routePatientId } = useParams();
  const [patients, setPatients] = useState([]);
  const [wearable, setWearable] = useState(null);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const patient = useMemo(
    () => patients.find(row => patientId(row) === routePatientId) || null,
    [patients, routePatientId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([getPatients(), getWearable(routePatientId), getSafety(routePatientId)])
      .then(([patientsRes, wearableRes, safetyRes]) => {
        if (cancelled) return;
        setPatients(Array.isArray(patientsRes.data) ? patientsRes.data : []);
        setWearable(wearableRes.data);
        setFlags(Array.isArray(safetyRes.data) ? safetyRes.data : []);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setError('Could not load patient dashboard data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [routePatientId]);

  const metrics = wearable?.metrics || {};
  const meds = Array.isArray(patient?.meds) ? patient.meds : [];

  return (
    <div className="patient-page">
      <header className="patient-header">
        <div className="brand">🧬 GlycoAgent</div>
        <h1>Hi, {patient?.name || 'there'}</h1>
        <div className="appointment-card">
          <span>Next appointment</span>
          <strong>{daysUntil(patient?.next_appointment_iso)} days</strong>
        </div>
      </header>

      {loading && <Spinner label="Loading your dashboard…" />}
      {error && <div className="error-banner">{error}</div>}

      <section className="mobile-card">
        <h2>Today’s wearable data</h2>
        <div className="ring-grid">
          <WearableRing label="HRV" value={metrics.hrv_ms?.avg_30d} unit="ms" metric={metrics.hrv_ms} progressValue={metrics.hrv_ms?.avg_30d} />
          <WearableRing label="Recovery" value={metrics.recovery_score?.avg_30d} metric={metrics.recovery_score} progressValue={metrics.recovery_score?.avg_30d} />
          <WearableRing label="RHR" value={metrics.rhr_bpm?.avg_30d} unit="bpm" metric={metrics.rhr_bpm} progressValue={100 - Number(metrics.rhr_bpm?.avg_30d || 0)} />
        </div>
      </section>

      <SafetyBanners flags={flags} compact />

      <section className="mobile-card">
        <h2>Medication log</h2>
        <MedicationLog meds={meds} />
      </section>

      <Link className="full-brief-link" to={`/?patient=${encodeURIComponent(routePatientId)}`}>View full clinical brief →</Link>
    </div>
  );
}
