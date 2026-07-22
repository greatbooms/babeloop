import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useT } from '../i18n/lang-context';
import { Button } from './Button';

const navigation = [
  ['/', 'home'],
  ['/brands', 'brands'],
  ['/media', 'media'],
  ['/ads', 'ads'],
  ['/briefs', 'briefs'],
  ['/review', 'review'],
  ['/experiments', 'experiments'],
  ['/performance', 'performance'],
] as const;

export function AppShell({ user, onLogout, children }: { user: { displayName?: string | null; email: string; role: string }; onLogout: () => void; children: ReactNode }) {
  const { lang, setLang, t } = useT();
  return (
    <div className="app-shell">
      <header className="top-nav">
        <NavLink className="wordmark" to="/">BabeLoop</NavLink>
        <nav className="nav-tabs" aria-label={t('nav.ariaLabel')}>
          {navigation.map(([to, key]) => (
            <NavLink key={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end={to === '/'} to={to} title={t(`nav.${key}.hint`)} data-hint={t(`nav.${key}.hint`)}>{t(`nav.${key}.label`)}</NavLink>
          ))}
        </nav>
        <div className="account-area">
          <div className="lang-toggle" role="group" aria-label={t('common.languageSelector')}>
            <button type="button" className={lang === 'ko' ? 'active' : ''} onClick={() => setLang('ko')}>{t('common.korean')}</button>
            <button type="button" className={lang === 'zhTw' ? 'active' : ''} onClick={() => setLang('zhTw')}>{t('common.traditionalChinese')}</button>
          </div>
          <span className="account-copy"><strong>{user.displayName || user.email}</strong><small>{t(`common.role.${user.role}`) === `common.role.${user.role}` ? user.role : t(`common.role.${user.role}`)}</small></span>
          <Button size="sm" onClick={onLogout}>{t('common.logout')}</Button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
