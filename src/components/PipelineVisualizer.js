/* ─── Pipeline Visualizer ─────────────────────────────────────────────────
 * Shows a step-by-step progress tracker for BMAD pipelines.
 * Steps can be: waiting | running | reviewing | done | error
 */
import React from 'react';

const STATUS_META = {
  waiting:   { icon: '○',  color: 'var(--text-muted)',     label: 'En attente' },
  running:   { icon: '⟳',  color: 'var(--accent-blue)',    label: 'En cours…'  },
  reviewing: { icon: '↔',  color: 'var(--accent-yellow, #f0a500)', label: 'Revue croisée…' },
  done:      { icon: '✓',  color: 'var(--accent-green)',   label: 'Terminé'    },
  completed: { icon: '✓',  color: 'var(--accent-green)',   label: 'Terminé'    },
  error:     { icon: '✗',  color: 'var(--accent-red)',     label: 'Erreur'     },
};

/**
 * Props:
 *  steps: Array<{ agent, agentIcon, name, status, output?, error?, reviewState?, reviewRounds? }>
 *  compact?: boolean  — smaller inline version
 */
export default function PipelineVisualizer({ steps = [], compact = false }) {
  if (!steps || steps.length === 0) return null;

  if (compact) {
    return (
      <div className="pipeline-viz-compact">
        {steps.map((step, i) => {
          const meta = STATUS_META[step.status] || STATUS_META.waiting;
          return (
            <React.Fragment key={i}>
              <span
                className={`pviz-step-dot pviz-step-${step.status}`}
                title={`${step.name || step.agent} — ${meta.label}`}
              >
                {step.agentIcon || step.icon || meta.icon}
              </span>
              {i < steps.length - 1 && (
                <span className="pviz-connector" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className="pipeline-viz">
      {steps.map((step, i) => {
        const meta = STATUS_META[step.status] || STATUS_META.waiting;
        const isLast = i === steps.length - 1;
        const reviewInfo = step.reviewState || null;
        const reviewRounds = step.reviewRounds || 0;

        return (
          <div key={i} className={`pviz-row pviz-row-${step.status}`}>
            {/* Left: connector line + marker */}
            <div className="pviz-timeline">
              <div
                className={`pviz-marker pviz-marker-${step.status}`}
                title={meta.label}
              >
                {step.status === 'running' || step.status === 'reviewing'
                  ? <span className="pviz-spin">⟳</span>
                  : (step.agentIcon || meta.icon)}
              </div>
              {!isLast && <div className={`pviz-line pviz-line-${step.status === 'done' || step.status === 'completed' ? 'done' : 'pending'}`} />}
            </div>

            {/* Right: content */}
            <div className="pviz-content">
              <div className="pviz-header">
                <span className="pviz-agent-name">{step.name || step.agent}</span>
                <span className={`pviz-status-badge pviz-badge-${step.status}`}>{meta.label}</span>
                {reviewRounds > 0 && (step.status === 'done' || step.status === 'completed') && (
                  <span className="pviz-review-badge" title={`${reviewRounds} tour(s) de revue croisée`}>
                    ↔ {reviewRounds}×
                  </span>
                )}
              </div>

              {/* Review-in-progress indicator */}
              {step.status === 'reviewing' && reviewInfo && (
                <div className="pviz-review-state">
                  <span className="pviz-review-icon">{reviewInfo.reviewerIcon || '🔍'}</span>
                  <span className="pviz-review-label">
                    {reviewInfo.phase === 'challenge'
                      ? `${reviewInfo.reviewerTitle} challenge le livrable…`
                      : `${reviewInfo.agentTitle || step.agent} révise…`}
                  </span>
                  {reviewInfo.round != null && reviewInfo.maxRounds != null && (
                    <span className="pviz-review-round">tour {reviewInfo.round}/{reviewInfo.maxRounds}</span>
                  )}
                </div>
              )}

              {/* Last critique snippet */}
              {step.status === 'reviewing' && reviewInfo?.lastCritique && (
                <div className="pviz-review-critique">
                  💬 {reviewInfo.lastCritique.slice(0, 160)}{reviewInfo.lastCritique.length > 160 ? '…' : ''}
                </div>
              )}

              {step.output && (step.status === 'done' || step.status === 'completed') && (
                <div className="pviz-output">
                  {step.output.slice(0, 240)}{step.output.length > 240 ? '…' : ''}
                </div>
              )}

              {step.error && step.status === 'error' && (
                <div className="pviz-error-msg">⚠ {step.error}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Props:
 *  steps: Array<{ agent, agentIcon, name, status, output?, error? }>
 *  compact?: boolean  — smaller inline version
 */
export default function PipelineVisualizer({ steps = [], compact = false }) {
  if (!steps || steps.length === 0) return null;

  if (compact) {
    return (
      <div className="pipeline-viz-compact">
        {steps.map((step, i) => {
          const meta = STATUS_META[step.status] || STATUS_META.waiting;
          return (
            <React.Fragment key={i}>
              <span
                className={`pviz-step-dot pviz-step-${step.status}`}
                title={`${step.name || step.agent} — ${meta.label}`}
              >
                {step.agentIcon || step.icon || meta.icon}
              </span>
              {i < steps.length - 1 && (
                <span className="pviz-connector" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className="pipeline-viz">
      {steps.map((step, i) => {
        const meta = STATUS_META[step.status] || STATUS_META.waiting;
        const isLast = i === steps.length - 1;

        return (
          <div key={i} className={`pviz-row pviz-row-${step.status}`}>
            {/* Left: connector line + marker */}
            <div className="pviz-timeline">
              <div
                className={`pviz-marker pviz-marker-${step.status}`}
                title={meta.label}
              >
                {step.status === 'running'
                  ? <span className="pviz-spin">⟳</span>
                  : (step.agentIcon || meta.icon)}
              </div>
              {!isLast && <div className={`pviz-line pviz-line-${step.status === 'done' ? 'done' : 'pending'}`} />}
            </div>

            {/* Right: content */}
            <div className="pviz-content">
              <div className="pviz-header">
                <span className="pviz-agent-name">{step.name || step.agent}</span>
                <span className={`pviz-status-badge pviz-badge-${step.status}`}>{meta.label}</span>
              </div>

              {step.output && step.status === 'done' && (
                <div className="pviz-output">
                  {step.output.slice(0, 240)}{step.output.length > 240 ? '…' : ''}
                </div>
              )}

              {step.error && step.status === 'error' && (
                <div className="pviz-error-msg">⚠ {step.error}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
