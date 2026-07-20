import { STATUS_LABELS, type StatusTone } from '../lib/status-labels';

export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: StatusTone }) {
  const definition = STATUS_LABELS[status];
  return (
    <span className={`status-badge status-${tone ?? definition?.tone ?? 'neutral'}`}>
      {label ?? definition?.ko ?? status}
      <span className="badge-code">{status}</span>
    </span>
  );
}
