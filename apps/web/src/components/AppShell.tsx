import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Button } from './Button';

const navigation = [
  ['/', '홈'],
  ['/brands', '브랜드'],
  ['/media', '미디어'],
  ['/ads', '광고'],
  ['/briefs', '브리프'],
  ['/review', '검토'],
  ['/experiments', '실험'],
  ['/performance', '성과'],
] as const;

const roleLabels: Record<string, string> = { ADMIN: '관리자', REVIEWER: '검수자', OPERATOR: '운영자' };

export function AppShell({ user, onLogout, children }: { user: { displayName?: string | null; email: string; role: string }; onLogout: () => void; children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <NavLink className="wordmark" to="/">BabeLoop</NavLink>
        <nav className="nav-tabs" aria-label="주요 메뉴">
          {navigation.map(([to, label]) => (
            <NavLink key={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end={to === '/'} to={to}>{label}</NavLink>
          ))}
        </nav>
        <div className="account-area">
          <span className="account-copy"><strong>{user.displayName || user.email}</strong><small>{roleLabels[user.role] ?? user.role}</small></span>
          <Button size="sm" onClick={onLogout}>로그아웃</Button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
