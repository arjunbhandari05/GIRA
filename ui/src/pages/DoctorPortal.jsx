import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getBrief, getPatients, getSafety, getWearable, uploadGenome } from '../api.js';
import BriefRenderer from '../components/BriefRenderer.jsx';
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
  const [briefResponse, setBriefResponse] = useState(null);
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
    setBriefResponse(null);
    setLoadingWearable(true);
    setError('');
    Promise.all([getWearable(selectedId), getSafety(selectedId)])
      .then(([wearableResult, safetyResult]) => {
        if (cancelled) return;
        setWearable(wearableResult.data);
        setSafetyFlags(Array.isArray(safetyResult.data) ? safetyResult.data : []);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setError('Could not load wearable data for this patient.');
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

  const generateBrief = async () => {
    if (!selectedId) return;
    setLoadingBrief(true);
    setBriefResponse(null);
    setError('');
    try {
      const { data } = await getBrief(selectedId);
      setBriefResponse(data);
    } catch (err) {
      console.error(err);
      setError('Brief generation failed. Check the backend and try again.');
    } finally {
      setLoadingBrief(false);
    }
  };

  const flags = briefResponse?.safety_flags || safetyFlags;

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
            <button className="primary-btn" disabled={!selectedId || loadingBrief} onClick={generateBrief}>Generate Brief</button>
          </div>
        </section>

        {loadingBrief ? (
          <Spinner full label="Analyzing genomic profile… ~60 seconds" />
        ) : (
          <>
            {selectedId && <SafetyBanners flags={flags} />}
            <BriefRenderer markdown={briefResponse?.brief_md} />
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
