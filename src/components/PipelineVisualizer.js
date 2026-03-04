/* ─── Pipeline Visualizer ─────────────────────────────────────────────────
 * Shows a step-by-step progress tracker for BMAD pipelines.
 * Steps can be: waiting | running | done | error
 */
import React from 'react';

const STATUS_META = {
  waiting: { icon: '○',  color: 'var(--text-muted)',     label: 'En attente' },
  running: { icon: '⟳',  color: 'var(--accent-blue)',    label: 'En cours…'  },
  done:    { icon: '✓',  color: 'var(--accent-green)',   label: 'Terminé'    },
  error:   { icon: '✗',  color: 'var(--accent-red)',     label: 'Erreur'     },
};

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
