import { useState } from 'react';

const TOOL_LABELS = {
  get_snp_profile: '🧬 SNP profile',
  fetch_clinvar: '📘 ClinVar',
  fetch_pharmgkb: '💊 PharmGKB',
  fetch_whoop: '⌚ WHOOP',
  fetch_glucose: '🩸 Blood glucose (CGM)',
  fetch_pubmed: '🔍 PubMed',
  fetch_rxnorm: '💉 RxNorm interactions',
  fetch_trials: '🧪 ClinicalTrials.gov',
  check_safety_flags: '🛡️ Safety gates',
  generate_brief: '📝 Generate brief',
};

function shortValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '∅';
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${shortValue(v)}`)
      .join(' · ');
  }
  return String(value);
}

function ResultPanel({ name, summary }) {
  if (!summary) return null;

  if (name === 'fetch_glucose') {
    return (
      <div className="tt-glucose">
        <div>
          <span>TIR</span>
          <strong>{summary.tir_pct ?? '—'}%</strong>
        </div>
        <div>
          <span>Avg</span>
          <strong>{summary.avg_mgdl ?? '—'} mg/dL</strong>
        </div>
        <div>
          <span>GMI</span>
          <strong>{summary.gmi_pct ?? '—'}%</strong>
        </div>
        <div>
          <span>Trend</span>
          <strong>{summary.trend ?? '—'}</strong>
        </div>
        <div>
          <span>Hypos</span>
          <strong>{summary.hypos ?? 0}</strong>
        </div>
        <div>
          <span>Controlled</span>
          <strong>{summary.controlled ? 'yes' : 'no'}</strong>
        </div>
      </div>
    );
  }

  if (name === 'check_safety_flags') {
    const flags = summary.flags || [];
    if (!flags.length) return <div className="tt-line">No safety flags fired</div>;
    return (
      <div className="tt-flags">
        {flags.map((f, i) => (
          <span key={i} className={`tt-flag ${(f.severity || '').toLowerCase()}`}>
            {f.severity || '?'} · {f.gene}
          </span>
        ))}
      </div>
    );
  }

  return <div className="tt-line">{shortValue(summary)}</div>;
}

export default function ToolTrace({ trace = [], backend, error }) {
  const [openStep, setOpenStep] = useState(null);

  if (!trace.length) {
    return (
      <div className="tool-trace empty">
        <strong>Agent reasoning trail</strong>
        <p>No trace yet — generate the agentic brief to see how Nemotron called each tool.</p>
      </div>
    );
  }

  return (
    <div className="tool-trace">
      <div className="tool-trace-header">
        <strong>Agent reasoning trail</strong>
        <span className="tt-meta">
          Backend: <em>{backend || 'unknown'}</em>
          {error ? <> · fallback: <em>{error}</em></> : null}
          {' · '}
          {trace.length} tool call{trace.length === 1 ? '' : 's'}
        </span>
      </div>

      <ol className="tt-list">
        {trace.map((step) => {
          const open = openStep === step.step;
          const label = TOOL_LABELS[step.tool] || step.tool;
          const args = step.args_summary || {};
          return (
            <li
              key={step.step}
              className={`tt-step ${open ? 'open' : ''} ${step.deterministic ? 'fallback' : ''}`}
              onClick={() => setOpenStep(open ? null : step.step)}
            >
              <div className="tt-row">
                <span className="tt-num">#{step.step}</span>
                <span className="tt-name">{label}</span>
                <span className="tt-tool-id">{step.tool}</span>
                {step.deterministic ? <span className="tt-pill">fallback</span> : null}
                {step.auto_invoked ? <span className="tt-pill">enforced</span> : null}
              </div>
              {open ? (
                <div className="tt-body">
                  <div className="tt-section">
                    <div className="tt-label">Args</div>
                    <pre className="tt-pre">{JSON.stringify(args, null, 2)}</pre>
                  </div>
                  <div className="tt-section">
                    <div className="tt-label">Result</div>
                    <ResultPanel name={step.tool} summary={step.result_summary} />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
