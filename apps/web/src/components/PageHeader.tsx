import type { ReactNode } from 'react';

export function PageHeader({ title, step, description, hint, actions }: { title: string; step?: string; description: string; hint?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <div className="page-header-title-row">
          <h1>{title}</h1>
          {step && <span className="step-chip">{step}</span>}
        </div>
        <p>{description}</p>
        {hint && <p className="page-header-hint">{hint}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
