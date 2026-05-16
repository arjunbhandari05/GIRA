import ToolTrace from './ToolTrace.jsx';

function fmtPct(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(1)}%`;
}

function fmtMgdl(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(0)} mg/dL`;
}

function tirTone(tir) {
  if (typeof tir !== 'number') return 'neutral';
  if (tir >= 70) return 'good';
  if (tir >= 54) return 'warn';
  return 'bad';
}

function trendArrow(trend) {
  if (trend === 'improving') return '↗';
  if (trend === 'worsening') return '↘';
  if (trend === 'flat') return '→';
  return '·';
}

function GlucoseCard({ glucose }) {
  if (!glucose || !glucose.available) {
    return (
      <div className="agent-card glucose">
        <header>🩸 Blood glucose (CGM)</header>
        <div className="empty">No CGM data available</div>
      </div>
    );
  }
  const tir = glucose.time_in_range_pct;
  return (
    <div className={`agent-card glucose tone-${tirTone(tir)}`}>
      <header>
        🩸 Blood glucose (30 days · {glucose.source || 'CGM'})
      </header>
      <div className="glucose-grid">
        <div className="g-stat big">
          <span>Time in range</span>
          <strong>{fmtPct(tir)}</strong>
          <em className={`tone-${tirTone(tir)}`}>
            {glucose.controlled ? 'controlled' : 'uncontrolled'}
          </em>
        </div>
        <div className="g-stat">
          <span>Average glucose</span>
          <strong>{fmtMgdl(glucose.avg_glucose_mgdl)}</strong>
        </div>
        <div className="g-stat">
          <span>GMI (est. A1c)</span>
          <strong>{glucose.gmi_pct ?? '—'}%</strong>
        </div>
        <div className="g-stat">
          <span>Glycemic CV</span>
          <strong>{glucose.cv_pct ?? '—'}%</strong>
        </div>
        <div className="g-stat">
          <span>Trend (week 1 → 4)</span>
          <strong>
            {trendArrow(glucose.trend_direction)} {glucose.trend_direction || '—'}
          </strong>
        </div>
        <div className="g-stat">
          <span>Hypoglycemic events</span>
          <strong>{glucose.hypoglycemic_events ?? 0}</strong>
        </div>
      </div>
    </div>
  );
}

function WearableCard({ wearable }) {
  if (!wearable || !wearable.available) {
    return (
      <div className="agent-card wearable">
        <header>⌚ WHOOP — 30 days</header>
        <div className="empty">No wearable data available</div>
      </div>
    );
  }
  return (
    <div className="agent-card wearable">
      <header>⌚ WHOOP — 30 days</header>
      <div className="wearable-grid">
        <div className="w-stat">
          <span>HRV</span>
          <strong>{wearable.hrv_ms_avg ?? '—'} ms</strong>
          <em>{trendArrow(wearable.hrv_trend)} {wearable.hrv_trend || ''}</em>
        </div>
        <div className="w-stat">
          <span>Resting HR</span>
          <strong>{wearable.rhr_avg ?? '—'} bpm</strong>
          <em>{trendArrow(wearable.rhr_trend)} {wearable.rhr_trend || ''}</em>
        </div>
        <div className="w-stat">
          <span>Recovery</span>
          <strong>{wearable.recovery_avg ?? '—'}</strong>
        </div>
        <div className="w-stat">
          <span>Hypoglycemia signal</span>
          <strong>{wearable.hypoglycemia_signal ? 'detected' : 'none'}</strong>
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({ recommendation, actionRequired }) {
  const rec = recommendation || {};
  const rationale = Array.isArray(rec.rationale) ? rec.rationale : [];
  const pmids = Array.isArray(rec.supporting_pmids) ? rec.supporting_pmids : [];

  return (
    <div className={`agent-card recommendation ${actionRequired ? 'tone-bad' : 'tone-good'}`}>
      <header>
        {actionRequired ? '⚡ Action required' : '✓ No medication change required'}
      </header>
      {rec.switch_required ? (
        <div className="rec-switch">
          <div>
            <span>Discontinue</span>
            <strong>{rec.discontinue || '—'}</strong>
          </div>
          <div className="rec-arrow">→</div>
          <div>
            <span>Start</span>
            <strong>{rec.start || '—'}</strong>
          </div>
        </div>
      ) : null}
      {rationale.length ? (
        <ul className="rec-rationale">
          {rationale.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      ) : null}
      {pmids.length ? (
        <div className="rec-pmids">
          {pmids.map((pmid) => (
            <a
              key={pmid}
              href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
              target="_blank"
              rel="noreferrer"
            >
              PMID {pmid}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SnpTable({ snps }) {
  if (!snps || !snps.length) return null;
  return (
    <div className="agent-card snps">
      <header>🧬 Pharmacogenomic findings</header>
      <table className="snp-table">
        <thead>
          <tr>
            <th>Gene</th>
            <th>rsID</th>
            <th>Genotype</th>
            <th>Drug</th>
            <th>Evidence</th>
            <th>Finding</th>
          </tr>
        </thead>
        <tbody>
          {snps.map((row) => (
            <tr key={row.rsid}>
              <td>{row.gene}</td>
              <td className="mono">{row.rsid}</td>
              <td className="mono">{row.genotype}</td>
              <td>{row.drug || '—'}</td>
              <td>{row.evidence_level || '—'}</td>
              <td>{row.finding || 'No annotation for this genotype'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrialsCard({ trials, trialMeta }) {
  if (!trials || !trials.length) {
    return (
      <div className="agent-card trials">
        <header>🧪 Matching trials</header>
        {trialMeta?.detail ? (
          <p className="trial-api-note">{trialMeta.detail}</p>
        ) : null}
        <div className="empty">No recruiting trials matched (live ClinicalTrials.gov search)</div>
      </div>
    );
  }
  return (
    <div className="agent-card trials">
      <header>🧪 Matching trials ({trials.length})</header>
      {trialMeta?.status && trialMeta.status !== 'ok' ? (
        <p className="trial-api-note">
          API status: <strong>{trialMeta.status}</strong>
          {trialMeta.detail ? ` — ${trialMeta.detail}` : ''}
        </p>
      ) : (
        <p className="trial-api-note subtle">
          Pulled live from ClinicalTrials.gov (recruiting T2D studies; gene + location filters).
        </p>
      )}
      <ul className="trial-list">
        {trials.map((t) => (
          <li key={t.nct_id}>
            <a href={t.url} target="_blank" rel="noreferrer">
              {t.nct_id}
            </a>{' '}
            · <strong>{t.title}</strong>
            <div className="trial-meta">
              {t.phase || ''} · {t.location || 'Location TBD'}
              {Array.isArray(t.match_genes) && t.match_genes.length
                ? ` · ${t.match_genes.join(', ')}`
                : ''}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CitationsCard({ citations }) {
  if (!citations || !citations.length) return null;
  return (
    <div className="agent-card citations">
      <header>📚 Evidence used in this brief ({citations.length})</header>
      <p className="citation-intro">
        Only PMIDs tied to the recommendation or fired safety gates — each with a short inference.
      </p>
      <ul className="citation-list">
        {citations.map((c) => (
          <li key={c.pmid}>
            <div className="citation-head">
              <a href={c.url} target="_blank" rel="noreferrer">
                PMID {c.pmid}
              </a>
              {c.title ? <span className="citation-title"> — {c.title}</span> : null}
            </div>
            {c.inference ? <div className="citation-inference">{c.inference}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SafetyCard({ flags }) {
  if (!flags || !flags.length) {
    return (
      <div className="agent-card safety tone-good">
        <header>🛡️ Safety gates</header>
        <div className="empty">No deterministic safety flags fired</div>
      </div>
    );
  }
  return (
    <div className="agent-card safety tone-bad">
      <header>🛡️ Safety gates ({flags.length})</header>
      <ul className="safety-list-cards">
        {flags.map((f, i) => (
          <li key={`${f.gene}-${i}`} className={`safety-card-row ${(f.severity || '').toLowerCase()}`}>
            <div className="row-head">
              <strong>{f.severity}</strong> · {f.gene} · <span className="mono">{f.rsid}</span>
            </div>
            <div>{f.flag}</div>
            <small>{f.action}</small>
            {f.currently_prescribed ? (
              <em className="prescribed">⚠ patient is currently on this drug</em>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AgentBrief({ brief, patient }) {
  if (!brief) return null;

  const trace = brief._trace || [];
  const backend = brief._backend;
  const error = brief._backend_error;

  return (
    <div className="agent-brief">
      <div className="agent-brief-header">
        <div>
          <h2>🤖 Agentic clinical brief</h2>
          <p className="agent-brief-sub">
            {brief.patient_summary || (patient ? `Brief for ${patient.name}` : '')}
          </p>
        </div>
        {brief.cached !== undefined ? (
          <span className={`agent-pill ${brief.cached ? 'cached' : 'fresh'}`}>
            {brief.cached ? 'cached' : 'fresh run'}
          </span>
        ) : null}
      </div>

      <div className="agent-grid">
        <RecommendationCard
          recommendation={brief.recommendation}
          actionRequired={brief.action_required}
        />
        <SafetyCard flags={brief.safety_flags} />
        <GlucoseCard glucose={brief.glucose_insight} />
        <WearableCard wearable={brief.wearable_insight} />
      </div>

      <SnpTable snps={brief.snp_summary} />
      <TrialsCard trials={brief.trial_matches} trialMeta={brief.trial_search_meta} />
      <CitationsCard citations={brief.citations} />

      <ToolTrace trace={trace} backend={backend} error={error} />
    </div>
  );
}
