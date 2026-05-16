import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getAgentBrief,
  getPatients,
  getSafety,
  getWearable,
  uploadGenome,
} from '../api.js';
import AgentBrief from '../components/AgentBrief.jsx';
import FileDropZone from '../components/FileDropZone.jsx';
import MetricCards from '../components/MetricCards.jsx';
import SafetyBanners from '../components/SafetyBanners.jsx';
import Spinner from '../components/Spinner.jsx';
import WearableCharts from '../components/WearableCharts.jsx';

function patientId(patient) {
  return patient?.patient_id || patient?.id || '';
}

function medList(patient) {
  return Array.isArray(patient?.meds) ? patient.meds : [];
}

export default function DoctorPortal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('patient') || '');
  const [wearable, setWearable] = useState(null);
  const [safetyFlags, setSafetyFlags] = useState([]);
  const [agentBrief, setAgentBrief] = useState(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingWearable, setLoadingWearable] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const selectedPatient = useMemo(
    () => patients.find(patient => patientId(patient) === selectedId) || null,
    [patients, selectedId],
  );

  const loadPatients = async nextSelectedId => {
    setLoadingPatients(true);
    setError('');
    try {
      const { data } = await getPatients();
      const rows = Array.isArray(data) ? data : [];
      setPatients(rows);
      const desired = nextSelectedId || selectedId || searchParams.get('patient');
      const existing = rows.find(patient => patientId(patient) === desired);
      const nextId = patientId(existing || rows[0]);
      setSelectedId(nextId);
      if (nextId) setSearchParams({ patient: nextId });
    } catch (err) {
      console.error(err);
      setError('Could not load patients from the backend.');
    } finally {
      setLoadingPatients(false);
    }
  };

  useEffect(() => {
    loadPatients(searchParams.get('patient') || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setWearable(null);
    setSafetyFlags([]);
    setAgentBrief(null);
    setLoadingWearable(true);
    setError('');
    Promise.all([
      getWearable(selectedId),
      getSafety(selectedId),
      getAgentBrief(selectedId, { cacheOnly: true }),
    ])
      .then(([wearableResult, safetyResult, briefResult]) => {
        if (cancelled) return;
        setWearable(wearableResult.data);
        setSafetyFlags(Array.isArray(safetyResult.data) ? safetyResult.data : []);
        const brief = briefResult.data;
        if (brief && !brief.error) setAgentBrief(brief);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setError('Could not load patient data.');
      })
      .finally(() => {
        if (!cancelled) setLoadingWearable(false);
      });
    return () => { cancelled = true; };
  }, [selectedId]);

  const selectPatient = id => {
    setSelectedId(id);
    setSearchParams({ patient: id });
  };

  const handleUpload = async file => {
    setUploading(true);
    setError('');
    try {
      const { data } = await uploadGenome(file);
      await loadPatients(data.patient_id);
    } catch (err) {
      console.error(err);
      setError('Genome upload failed. Please try another 23andMe raw file.');
    } finally {
      setUploading(false);
    }
  };

  const generateBrief = async ({ refresh = false } = {}) => {
    if (!selectedId) return;
    setLoadingBrief(true);
    if (refresh) setAgentBrief(null);
    setError('');
    try {
      const { data } = await getAgentBrief(selectedId, { refresh });
      if (data?.error && data.error !== 'not_cached') {
        setError(data.error);
        return;
      }
      setAgentBrief(data);
    } catch (err) {
      console.error(err);
      setError('Brief generation failed. Check NVIDIA_API_KEY / backend logs.');
    } finally {
      setLoadingBrief(false);
    }
  };

  const flags = agentBrief?.safety_flags || safetyFlags;

  return (
    <div className="doctor-page">
      <aside className="left-panel">
        <div className="brand">🧬 GlycoAgent</div>
        <div className="panel-subtitle">Patient roster</div>
        {loadingPatients && <Spinner label="Loading patients…" />}
        <div className="patient-list">
          {patients.map(patient => {
            const id = patientId(patient);
            return (
              <div
                key={id}
                className={`patient-card ${selectedId === id ? 'selected' : ''}`}
                onClick={() => selectPatient(id)}
              >
                <strong>{patient.name || 'Unnamed patient'}</strong>
                <span>{id}</span>
                <small>{patient.next_appointment_iso || 'No appointment'}</small>
                <div className="pill-row">
                  {medList(patient).map(med => <span className="pill" key={med}>{med}</span>)}
                </div>
              </div>
            );
          })}
        </div>
        <FileDropZone onFile={handleUpload} />
        {uploading && <Spinner label="Uploading genome…" />}
      </aside>

      <main className="center-panel">
        {error && <div className="error-banner">{error}</div>}
        <section className="selected-header">
          <div>
            <h1>{selectedPatient?.name || 'Select a patient'}</h1>
            <p>{selectedId || 'No patient selected'}</p>
            <div className="pill-row">{medList(selectedPatient).map(med => <span className="pill" key={med}>{med}</span>)}</div>
            <small>{selectedPatient?.next_appointment_iso || 'No appointment date'}</small>
          </div>
          <div className="header-actions">
            {selectedId && <Link className="link-button" to={`/patient/${selectedId}`}>Patient view</Link>}
            <button
              className="primary-btn agent-btn"
              disabled={!selectedId || loadingBrief}
              onClick={() => generateBrief({ refresh: false })}
              title="Runs Nemotron tool loop (ClinVar, PubMed, CGM, etc.) then assembles the brief. Cached after first run."
            >
              {agentBrief ? '↻ Regenerate brief' : 'Generate clinical brief'}
            </button>
            {agentBrief?.cached ? (
              <button
                className="link-button"
                disabled={loadingBrief}
                onClick={() => generateBrief({ refresh: true })}
                title="Discard cache and run a fresh agent pass"
              >
                Force refresh
              </button>
            ) : null}
          </div>
        </section>

        {loadingBrief ? (
          <Spinner full label="Nemotron is calling tools… first run can take 1–4 min" />
        ) : agentBrief ? (
          <AgentBrief brief={agentBrief} patient={selectedPatient} />
        ) : (
          <>
            {selectedId && <SafetyBanners flags={flags} />}
            <div className="empty-card">
              Select a patient and click <strong>Generate clinical brief</strong> to run the
              agent (live ClinVar, PubMed, CGM, and structured recommendations).
            </div>
          </>
        )}
      </main>

      <aside className="right-panel">
        <h2>Wearables</h2>
        {loadingWearable ? <Spinner label="Loading wearable data…" /> : <WearableCharts wearable={wearable} />}
        <MetricCards wearable={wearable} />
      </aside>
    </div>
  );
}
