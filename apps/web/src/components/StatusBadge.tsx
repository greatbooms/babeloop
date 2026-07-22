import { STATUS_LABELS, type StatusTone } from '../lib/status-labels';
import { useT } from '../i18n/lang-context';

export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: StatusTone }) {
  const { lang } = useT();
  const definition = STATUS_LABELS[status];
  return (
    <span className={`status-badge status-${tone ?? definition?.tone ?? 'neutral'}`}>
      {label ?? definition?.[lang] ?? status}
      <span className="badge-code">{status}</span>
    </span>
  );
}
