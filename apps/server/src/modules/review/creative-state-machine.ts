import { CreativeStatus, UserRole } from '../../../generated/prisma';
import { GraphQLError } from 'graphql';

export interface TransitionContext {
  creative: {
    status: CreativeStatus;
    createdById: string | null;
    lastEditedById: string | null;
    minorFlagged: boolean;
    locale: string;
  };
  actor: { id: string; role: UserRole };
}

export const ALLOWED_TRANSITIONS: Record<CreativeStatus, CreativeStatus[]> = {
  DRAFT: ['POLICY_CHECKED'],
  POLICY_CHECKED: ['IN_REVIEW'],
  IN_REVIEW: ['LOCALIZATION_APPROVED', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED'],
  LOCALIZATION_APPROVED: ['APPROVED', 'REVISION_REQUESTED', 'REJECTED'],
  APPROVED: [],
  REVISION_REQUESTED: ['DRAFT'],
  REJECTED: [],
};

const APPROVAL_TARGETS: CreativeStatus[] = ['LOCALIZATION_APPROVED', 'APPROVED'];

function fail(message: string, code: string): never {
  throw new GraphQLError(message, { extensions: { code } });
}

/** 모든 상태 전이는 이 함수를 통과한다. UI가 아니라 서버가 막는다. */
export function assertTransition(context: TransitionContext, to: CreativeStatus): void {
  const { creative, actor } = context;

  if (!ALLOWED_TRANSITIONS[creative.status].includes(to)) {
    fail(`${creative.status}에서 ${to}로 전이할 수 없습니다`, 'ILLEGAL_TRANSITION');
  }

  if (to === 'IN_REVIEW' && creative.minorFlagged) {
    fail(
      '미성년자 신호 플래그가 해제되지 않았습니다 — 검토 요청 불가 (하드게이트)',
      'MINOR_FLAG_ACTIVE',
    );
  }

  if (APPROVAL_TARGETS.includes(to)) {
    if (actor.role !== 'REVIEWER' && actor.role !== 'ADMIN') {
      fail('승인 권한이 없습니다 (REVIEWER/ADMIN 전용)', 'FORBIDDEN');
    }
    if (actor.id === creative.createdById || actor.id === creative.lastEditedById) {
      fail('자기승인은 허용되지 않습니다', 'SELF_APPROVAL_FORBIDDEN');
    }
  }

  if (to === 'APPROVED' && creative.status === 'IN_REVIEW' && creative.locale === 'zh-TW') {
    fail('zh-TW 소재는 현지화 검수 없이 승인할 수 없습니다', 'LOCALIZATION_GATE');
  }
}
