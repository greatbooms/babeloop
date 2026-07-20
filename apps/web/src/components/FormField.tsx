import type { ReactNode } from 'react';

export function FormField({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="form-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );
}
