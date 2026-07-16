import { CreativeStatus, UserRole } from '../../../generated/prisma';
import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  TransitionContext,
} from './creative-state-machine';

const base: TransitionContext = {
  creative: {
    status: 'DRAFT' as CreativeStatus,
    createdById: 'author-1',
    lastEditedById: null,
    minorFlagged: false,
    locale: 'zh-TW',
  },
  actor: { id: 'reviewer-1', role: 'REVIEWER' as UserRole },
};

function ctx(over: {
  status?: CreativeStatus;
  actorId?: string;
  role?: UserRole;
  minorFlagged?: boolean;
  lastEditedById?: string | null;
  locale?: string;
}): TransitionContext {
  return {
    creative: {
      ...base.creative,
      status: over.status ?? base.creative.status,
      minorFlagged: over.minorFlagged ?? false,
      lastEditedById: over.lastEditedById ?? null,
      locale: over.locale ?? 'zh-TW',
    },
    actor: {
      id: over.actorId ?? 'reviewer-1',
      role: over.role ?? ('REVIEWER' as UserRole),
    },
  };
}

describe('CreativeStateMachine', () => {
  it('허용되지 않은 전이는 모두 거부한다 (매트릭스 전수)', () => {
    const all = Object.keys(ALLOWED_TRANSITIONS) as CreativeStatus[];
    for (const from of all) {
      for (const to of all) {
        const allowed = ALLOWED_TRANSITIONS[from].includes(to);
        const run = () => assertTransition(ctx({ status: from, locale: 'ko-KR' }), to);
        if (allowed) expect(run).not.toThrow();
        else expect(run).toThrow(/전이할 수 없습니다/);
      }
    }
  });

  it('미성년자 플래그가 해제되지 않으면 IN_REVIEW로 못 간다', () => {
    expect(() =>
      assertTransition(ctx({ status: 'POLICY_CHECKED', minorFlagged: true }), 'IN_REVIEW'),
    ).toThrow(/미성년자/);
  });

  it('자기승인 금지 — 생성자·최종수정자는 승인 전이를 실행할 수 없다', () => {
    expect(() =>
      assertTransition(ctx({ status: 'IN_REVIEW', actorId: 'author-1' }), 'LOCALIZATION_APPROVED'),
    ).toThrow(/자기승인/);
    expect(() =>
      assertTransition(
        ctx({
          status: 'LOCALIZATION_APPROVED',
          actorId: 'editor-2',
          lastEditedById: 'editor-2',
        }),
        'APPROVED',
      ),
    ).toThrow(/자기승인/);
  });

  it('승인 전이는 REVIEWER/ADMIN만 실행할 수 있다', () => {
    expect(() =>
      assertTransition(
        ctx({ status: 'IN_REVIEW', role: 'EDITOR' as UserRole }),
        'LOCALIZATION_APPROVED',
      ),
    ).toThrow(/권한/);
  });

  it('zh-TW가 아닌 소재는 IN_REVIEW에서 바로 APPROVED로 갈 수 있다', () => {
    expect(() =>
      assertTransition(ctx({ status: 'IN_REVIEW', locale: 'ko-KR' }), 'APPROVED'),
    ).not.toThrow();
    expect(() =>
      assertTransition(ctx({ status: 'IN_REVIEW', locale: 'zh-TW' }), 'APPROVED'),
    ).toThrow(/현지화 검수/);
  });
});
