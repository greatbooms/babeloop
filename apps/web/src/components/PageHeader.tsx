import type { ReactNode } from 'react';

export function PageHeader({ title, description, hint, actions }: { title: string; description: string; hint?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
        {hint && <p className="page-header-hint">{hint}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
