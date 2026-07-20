import type { ReactNode } from 'react';

export type PageGuideKey = 'home' | 'brands' | 'media' | 'ads' | 'briefs' | 'review' | 'experiments' | 'performance';

export type PageGuide = {
  role: ReactNode;
  steps: string[];
  buttons: Array<{ name: string; description: string }>;
  terms?: Array<{ term: string; description: string }>;
};

export const commonTerms = [
  { term: '브리프', description: '광고 기획서 — 누구에게(타깃), 어떤 메시지(훅·CTA)를, 어떤 형식으로 낼지 AI가 정리한 문서' },
  { term: '훅', description: '광고 첫 1~2초에 시선을 잡는 장치' },
  { term: '추적코드', description: '내보낸 소재마다 붙는 고유 코드(BL-…). 광고 성과를 소재별로 연결하는 열쇠' },
  { term: '현지화 검수', description: 'AI 번체중문 초안을 대만 원어민 감각으로 다듬는 단계' },
  { term: '정책 검사', description: '금지어·경쟁사 표절·미성년 신호 자동 점검' },
];

export const pageGuides: Record<PageGuideKey, PageGuide> = {
  home: {
    role: '경쟁 광고 수집부터 성과 환류까지 BabeLoop의 전체 작업 순서와 각 탭의 역할을 보여줍니다.',
    steps: ['광고를 수집·분석합니다.', '브리프와 문구를 만들고 검토합니다.', '실험으로 내보낸 뒤 성과를 다음 브리프에 반영합니다.'],
    buttons: [{ name: '탭으로 이동', description: '해당 단계의 작업 화면을 엽니다 (무료)' }],
  },
  brands: {
    role: <>우리 제품의 소개·기능·표현 원칙을 관리합니다. 입력한 내용은 브리프 생성 시 AI 프롬프트의 <strong>「우리 제품」</strong> 섹션에 들어갑니다.</>,
    steps: ['브랜드 기본 정보를 등록합니다.', '소개와 주요 기능을 구체적으로 적습니다.', '광고에서 지킬 가이드라인을 추가합니다.'],
    buttons: [
      { name: '브랜드 등록/소개 저장', description: '제품 정보를 저장합니다 (무료)' },
      { name: '기능·가이드라인 추가/삭제', description: 'AI가 참고할 제품 정보와 표현 원칙을 관리합니다 (무료)' },
    ],
  },
  media: {
    role: '이미지나 영상을 한 건씩 올려 텍스트만 추출하는 보조 도구입니다. 광고 수집과 연결하려면 광고 탭을 사용하세요.',
    steps: ['파일 종류와 파일을 선택합니다.', '업로드합니다.', '처리가 끝나면 OCR 또는 음성 전사 결과를 확인합니다.'],
    buttons: [
      { name: '업로드', description: '원본 파일을 저장합니다 (무료)' },
      { name: '텍스트 추출', description: '이미지 글자·영상 음성을 텍스트로 추출합니다 (AI, 건당 1~2센트)' },
    ],
  },
  ads: {
    role: '경쟁사 광고를 모으고, 미디어와 문구에서 재사용할 패턴을 찾는 루프의 시작 화면입니다.',
    steps: ['CSV 또는 수동 입력으로 광고를 등록합니다.', '미디어 텍스트를 추출하고 광고를 분석합니다.', '유사 광고와 이 광고를 참조한 브리프를 확인합니다.'],
    buttons: [
      { name: '미디어 텍스트 추출', description: '이미지 글자·영상 음성을 텍스트로 추출 (AI, 건당 1~2센트)' },
      { name: '광고 분석', description: '추출된 텍스트로 훅·타깃·감정 분류 (AI, ~1센트)' },
      { name: '재다운로드', description: '원본 미디어 다시 받기 (무료)' },
      { name: '유사 광고', description: '비슷한 메시지의 광고 검색 (무료)' },
    ],
  },
  briefs: {
    role: '브랜드 정보와 경쟁 광고 패턴을 바탕으로 광고 기획서와 문구 변형을 생성합니다.',
    steps: ['브랜드와 포커스를 정합니다.', '브리프를 생성합니다.', '문구 변형과 zh-TW 초안을 만든 뒤 검토 탭으로 이동합니다.'],
    buttons: [
      { name: '브리프 생성', description: '광고 기획서를 생성합니다 (AI, 비용 발생)' },
      { name: '문구 변형 3개 생성', description: '브리프에서 광고 문구와 번체중문 초안을 생성합니다 (AI, 비용 발생)' },
    ],
  },
  review: {
    role: '생성한 문구가 광고로 나가기 전에 정책, 번체중문 품질, 승인 책임을 확인하는 품질 게이트입니다.',
    steps: ['정책 검사를 실행합니다.', '검토를 요청하고 검수자가 현지화를 다듬습니다.', '최종 승인 후 실험에 추가합니다.'],
    buttons: [
      { name: '정책 검사', description: '금지어·유사도·미성년 신호를 검사합니다 (AI, 비용 발생)' },
      { name: '검토 요청/수정 요청/거절', description: '검토 상태를 변경하고 사유를 기록합니다 (무료)' },
      { name: '현지화 승인/최종 승인', description: '검수와 집행 승인을 기록합니다 (무료)' },
      { name: '실험에 추가', description: '승인 문구에 추적코드를 발급합니다 (무료)' },
    ],
  },
  experiments: {
    role: '승인 문구를 집행 단위로 묶고 추적코드가 포함된 파일로 내보냅니다.',
    steps: ['실험을 생성합니다.', '검토 탭에서 승인 문구를 실험에 추가합니다.', '집행용 파일을 내보냅니다.'],
    buttons: [
      { name: '실험 생성', description: '소재를 묶을 실험을 만듭니다 (무료)' },
      { name: '내보내기', description: '추적코드가 붙은 집행용 파일을 생성합니다 (무료)' },
    ],
  },
  performance: {
    role: '광고 플랫폼의 성과 CSV를 추적코드로 소재에 연결하고, 잘된 패턴을 다음 브리프로 환류합니다.',
    steps: ['성과 CSV를 업로드합니다.', '실험을 골라 소재별 퍼널을 확인합니다.', '성과를 근거로 다음 브리프를 생성합니다.'],
    buttons: [
      { name: '성과 업로드', description: 'CSV를 읽어 추적코드별 성과를 저장합니다 (무료)' },
      { name: '이 성과로 브리프 생성', description: '상위 성과를 근거로 새 브리프를 생성합니다 (AI, 비용 발생)' },
    ],
  },
};
