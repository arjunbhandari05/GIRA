import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';

function splitBrief(markdown = '') {
  const reasoningHeader = markdown.search(/\n##\s+Nemotron Reasoning Trace/i);
  if (reasoningHeader < 0) return { clean: markdown, reasoning: '' };

  const before = markdown.slice(0, reasoningHeader).trim();
  const after = markdown.slice(reasoningHeader).replace(/^\n?##\s+Nemotron Reasoning Trace\s*/i, '').trim();
  const citationMatch = after.search(/\n##\s+Citation List/i);

  if (citationMatch < 0) {
    return { clean: before, reasoning: after.replace(/^###\s+AI Reasoning\s*/i, '').trim() };
  }

  const reasoning = after.slice(0, citationMatch).replace(/^###\s+AI Reasoning\s*/i, '').trim();
  const citations = after.slice(citationMatch).trim();
  return { clean: `${before}\n\n${citations}`.trim(), reasoning };
}

export default function BriefRenderer({ markdown }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const parts = useMemo(() => splitBrief(markdown || ''), [markdown]);

  if (!markdown) return <div className="empty-card">Generate a brief to view clinical findings.</div>;

  return (
    <div className="brief-renderer">
      <div className="markdown-body">
        <ReactMarkdown>{parts.clean}</ReactMarkdown>
      </div>
      {parts.reasoning && (
        <div className="reasoning-toggle-block">
          <button className="secondary-btn" onClick={() => setShowReasoning(value => !value)}>
            {showReasoning ? 'Hide AI reasoning' : 'Show AI reasoning'}
          </button>
          {showReasoning && (
            <div className="reasoning-box">
              <ReactMarkdown>{parts.reasoning}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
