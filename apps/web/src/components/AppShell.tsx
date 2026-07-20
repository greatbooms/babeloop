import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Button } from './Button';

const navigation = [
  ['/', '홈', '전체 워크플로 안내'],
  ['/brands', '브랜드', 'BabeChat 제품 정보 등록 — 브리프 생성의 재료'],
  ['/media', '미디어', '파일 업로드 후 텍스트 추출 (단건 도구)'],
  ['/ads', '광고', '경쟁사 광고 수집·분석 — 루프의 시작'],
  ['/briefs', '브리프', '패턴 기반 브리프·문구·zh-TW 초안 생성'],
  ['/review', '검토', '정책 검사 → 검수 → 승인 게이트'],
  ['/experiments', '실험', '승인 문구 배정·추적코드 발급·내보내기'],
  ['/performance', '성과', '성과 CSV 업로드 → 소재별 퍼널 → 브리프 환류'],
] as const;

const roleLabels: Record<string, string> = { ADMIN: '관리자', REVIEWER: '검수자', OPERATOR: '운영자' };

export function AppShell({ user, onLogout, children }: { user: { displayName?: string | null; email: string; role: string }; onLogout: () => void; children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <NavLink className="wordmark" to="/">BabeLoop</NavLink>
        <nav className="nav-tabs" aria-label="주요 메뉴">
          {navigation.map(([to, label, hint]) => (
            <NavLink key={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end={to === '/'} to={to} title={hint} data-hint={hint}>{label}</NavLink>
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
