# BabeLoop 프로젝트 최종 기획 및 기술 명세

## 1. 프로젝트 기본 정보

### 프로젝트명

**BabeLoop**

### 부제

**AI Creative Intelligence & Growth Automation for BabeChat**

### 대상 서비스

- 서비스명: BabeChat
- 공식 웹사이트: `https://www.babechat.ai`
- 초기 목표 시장: 대만
- 초기 광고 언어: 번체중문 `zh-TW`
- 초기 핵심 경쟁사: WHIF
- 초기 핵심 전환 목표:
  1. 앱 설치
  2. 회원가입 완료
  3. 첫 채팅 시작
  4. 첫 메시지 전송
  5. 다음 날 재방문

---

# 2. 프로젝트 목적

BabeLoop는 BabeChat의 경쟁사 광고와 시장 레퍼런스를 수집·분석하고, 분석 결과를 바탕으로 새로운 광고 문구, 숏폼 영상 스크립트, 이미지 콘셉트 및 영상 소재를 생성하는 내부 마케팅 자동화 플랫폼이다.

생성된 광고 소재는 사람의 검토와 승인을 거쳐 Instagram, TikTok, Meta 광고 등에서 사용하며, 게시·집행 이후의 성과를 다시 수집해 다음 광고 생성 과정에 반영한다.

전체 시스템은 다음 루프로 작동해야 한다.

```text
경쟁사 및 시장 레퍼런스 수집
→ 광고 문구·영상·이미지 구조 분석
→ 반복되는 성공 패턴 추출
→ BabeChat용 광고 브리프 생성
→ 문구·이미지·영상 소재 생성
→ 번체중문 현지화 검토
→ 내부 승인
→ 게시 또는 광고 집행
→ 설치·가입·첫 채팅 성과 수집
→ 소재별 성과 비교
→ 다음 광고 생성에 반영
```

BabeLoop의 핵심은 경쟁사 광고를 복제하는 것이 아니다.

다음 질문에 답하는 시스템을 만드는 것이 목표다.

> 어떤 캐릭터, 감정, 훅, 문구, 영상 형식이 대만 사용자의 설치와 회원가입, 첫 채팅을 가장 효과적으로 유도하는가?

---

# 3. BabeChat 서비스 정의

BabeChat은 사용자가 자신의 취향에 맞는 AI 캐릭터를 발견하거나 직접 만들고, 캐릭터와 대화하면서 자신만의 이야기와 세계관을 경험하는 AI 캐릭터챗 및 인터랙티브 스토리 서비스다.

공식 서비스 설명을 기준으로 다음 기능을 핵심 제품 가치로 본다.

- 판타지, 로맨스, 이세계, 액션, 무협 등 다양한 장르의 캐릭터
- 사용자 취향에 맞는 AI 캐릭터 탐색
- 직접 캐릭터와 프로필 생성
- 사용자 페르소나 및 노트
- 로어북과 세계관 설정
- 대화 흐름에 따라 달라지는 감정 이미지
- 채팅 배경 이미지
- 선택지가 포함된 스토리 모드
- 캐릭터 음성
- 기본 무료 채팅
- 고성능 AI 모델을 사용하는 ProChat

BabeChat은 단순한 AI 비서나 일반 챗봇으로 표현하지 않는다.

BabeChat의 핵심 포지셔닝은 다음과 같다.

> 사용자가 이야기를 구경하는 것이 아니라, 자신의 취향에 맞는 캐릭터와 함께 이야기의 주인공이 되는 경험

BabeChat 공식 웹사이트와 앱스토어 설명에서도 사용자 취향에 맞는 캐릭터, 직접 만드는 캐릭터, 스토리 선택지, 음성, 감정 이미지 및 무료 채팅을 주요 기능으로 소개하고 있다. 

## 광고에서 우선 전달할 제품 가치

한 광고에 모든 기능을 넣지 않는다.

광고 하나는 다음 중 하나의 핵심 가치만 전달한다.

1. 내 취향에 맞는 캐릭터를 발견할 수 있다.
2. 내가 원하는 관계와 이야기를 직접 진행할 수 있다.
3. 사용자의 선택에 따라 스토리가 달라진다.
4. 캐릭터의 감정과 장면을 이미지와 음성으로 경험할 수 있다.
5. 원하는 캐릭터와 세계관을 직접 만들 수 있다.
6. 무료로 첫 대화를 시작할 수 있다.

---

# 4. 주요 경쟁사: WHIF

WHIF는 여성향, BL, 로맨스 및 웹소설형 스토리 경험에 집중한 AI 캐릭터챗 서비스로 분류한다.

WHIF가 강조하는 주요 요소는 다음과 같다.

- 여성향 및 BL 중심 포지셔닝
- 로맨스와 감정적 관계
- 캐릭터가 주도하는 서사
- 사용자의 선택에 따라 달라지는 이야기
- 웹소설처럼 이어지는 심리 및 상황 묘사
- 집착, 판타지, 드라마 등 강한 감정적 소재
- 회원가입 직후 제공하는 포인트 보상
- 대만 사용자를 위한 번체중문 서비스 및 홍보 페이지

WHIF의 공식 앱 소개와 서비스 페이지도 여성향·BL·로맨스, 몰입형 서사와 가입 보상을 주요 가치로 제시한다. 

## WHIF 강점 가설

- 여성향과 BL이라는 명확한 고객층
- 강한 감정과 관계 중심 문구
- 가입 즉시 보상으로 가입 장벽 감소
- 웹소설처럼 읽히는 고밀도 서사
- 대만 시장에 맞춘 번체중문 현지화
- 집착, 금지된 관계, 판타지 등 명확한 캐릭터 콘셉트

## BabeChat 차별화 가설

- BL과 로맨스에 한정되지 않는 넓은 장르
- 일반 대화, 소설 및 선택형 스토리 경험
- 감정 이미지, 배경 이미지 및 음성을 포함한 멀티모달 경험
- 캐릭터와 세계관을 직접 만드는 창작 기능
- 로어북, 페르소나 및 사용자 노트
- 다양한 AI 모델 선택
- 기본 무료 채팅
- 사용자 생성 캐릭터 생태계

이 내용은 마케팅 가설로 관리하며 사실로 고정하지 않는다.

실제 설치, 가입, 첫 채팅 및 유지율 데이터를 통해 어떤 차별점이 유효한지 검증한다.

---

# 5. 초기 시장: 대만

초기 주요 테스트 시장은 대만으로 설정한다.

## 로케일 원칙

기본 로케일은 다음과 같이 명확하게 구분한다.

```text
ko-KR
zh-TW
zh-CN
en-US
ja-JP
```

대만 광고에서 `zh-TW`와 `zh-CN`을 동일하게 처리하지 않는다.

모든 광고 문구에는 다음 상태를 저장한다.

- 한국어 원문
- AI가 생성한 번체중문 초안
- 대만 현지화 수정본
- 최종 승인본
- 검수자
- 검수 일시
- 수정 사유
- 금지 표현 여부
- 플랫폼 정책 검토 결과

AI가 번역한 번체중문 문구를 사람의 검토 없이 바로 게시하지 않는다.

## 초기 잠재 고객 가설

다음 세그먼트를 독립된 광고 실험 대상으로 관리한다.

1. 로맨스·BL·웹툰·웹소설을 즐기는 성인 여성
2. AI 캐릭터와 감정적 관계 및 대화를 원하는 사용자
3. 자신만의 캐릭터와 세계관을 만들고 싶은 창작형 사용자
4. 애니메이션·게임 캐릭터 롤플레이를 즐기는 사용자
5. 기존 AI 캐릭터챗의 기억력·표현력·번역 품질에 불만이 있는 사용자
6. 이야기를 읽는 것보다 직접 선택하고 참여하는 경험을 원하는 사용자

## 대만 시장 레퍼런스 풀

### 직접 경쟁사

- WHIF

### 현지화 및 크리에이티브 참고 후보

- Melting
- TingleChat
- Touchie
- Chara
- Rubii
- Caveduck
- Character.AI
- Talkie
- PolyBuzz
- Zeta
- Crushie AI
- LoveyDovey

모든 서비스를 직접 경쟁사로 분류하지 않는다.

다음 유형으로 구분한다.

```typescript
enum ReferenceCategory {
  DIRECT_COMPETITOR = 'DIRECT_COMPETITOR',
  LOCAL_MARKET_REFERENCE = 'LOCAL_MARKET_REFERENCE',
  CREATIVE_REFERENCE = 'CREATIVE_REFERENCE',
  FEATURE_REFERENCE = 'FEATURE_REFERENCE',
  ONBOARDING_REFERENCE = 'ONBOARDING_REFERENCE',
  MONETIZATION_REFERENCE = 'MONETIZATION_REFERENCE',
  CREATOR_ECOSYSTEM_REFERENCE = 'CREATOR_ECOSYSTEM_REFERENCE',
}
```

후보 서비스를 시스템에 등록하기 전에 다음을 확인한다.

- 대만 서비스 여부
- 공식 앱 및 웹사이트
- 공식 Instagram 및 TikTok 계정
- 대만에서 노출되는 광고 계정명
- 앱스토어 국가별 제공 여부
- 광고 및 랜딩 페이지 언어
- 운영 주체
- 성인 콘텐츠 및 연령 제한 여부

---

# 6. 초기 획득 목표와 퍼널

BabeLoop는 설치 수만으로 광고 성공 여부를 판단하지 않는다.

기본 사용자 획득 퍼널은 다음과 같다.

```text
광고 노출
→ 광고 클릭
→ 앱스토어 페이지 방문
→ 앱 설치
→ 첫 실행
→ 회원가입 완료
→ 캐릭터 조회
→ 채팅방 진입
→ 첫 메시지 전송
→ 메시지 10개 전송
→ 다음 날 재방문
→ 7일 내 재방문
→ 첫 결제
```

## 이벤트 정의

```typescript
enum AcquisitionEventName {
  AD_IMPRESSION = 'ad_impression',
  AD_CLICK = 'ad_click',
  STORE_VIEW = 'store_view',
  APP_INSTALL = 'app_install',
  FIRST_OPEN = 'first_open',
  COMPLETE_REGISTRATION = 'complete_registration',
  VIEW_CHARACTER = 'view_character',
  OPEN_CHAT = 'open_chat',
  SEND_FIRST_MESSAGE = 'send_first_message',
  COMPLETE_TEN_MESSAGES = 'complete_ten_messages',
  DAY_ONE_RETURN = 'day_one_return',
  DAY_SEVEN_RETURN = 'day_seven_return',
  START_TRIAL = 'start_trial',
  PURCHASE = 'purchase',
}
```

### 이벤트 의미

- `complete_registration`: 서버에서 사용자 계정 생성이 성공한 시점
- `open_chat`: 채팅 화면을 연 시점
- `send_first_message`: 사용자가 실제 첫 메시지를 보낸 시점
- `complete_ten_messages`: 사용자가 누적 메시지 10개를 보낸 시점
- `day_one_return`: 최초 활성화 다음 날 앱을 다시 실행한 시점

## 초기 KPI

- CTR
- 앱스토어 전환율
- CPI
- 설치 후 가입 전환율
- Cost per Signup
- 가입 후 첫 메시지 전환율
- Cost per Activated User
- 사용자당 메시지 수
- D1 Retention
- D7 Retention
- 결제 전환율
- CAC
- ROAS

## 캠페인 최적화 단계

### 1단계: 설치 최적화

가입 데이터가 충분하지 않은 초기에는 설치 이벤트를 기준으로 광고를 최적화한다.

다만 내부 평가는 CPI만 보지 않고 다음을 함께 확인한다.

- 설치 후 가입률
- 가입 후 첫 메시지 비율
- 첫 메시지까지 걸린 시간
- D1 유지율

### 2단계: 가입 최적화

가입 이벤트가 안정적으로 쌓이면 캠페인 최적화 이벤트를 `complete_registration`으로 변경한다.

### 3단계: 활성 사용자 최적화

충분한 데이터가 확보되면 다음 이벤트를 주요 품질 지표로 사용한다.

- 첫 메시지 전송
- 메시지 10개 전송
- 다음 날 재방문

설치는 많지만 가입이나 채팅으로 이어지지 않는 소재는 성공한 광고로 평가하지 않는다.

---

# 7. 경쟁사 광고 데이터 수집 전략

## 기본 원칙

Sensor Tower API 접근 가능 여부가 시스템 전체 개발을 막아서는 안 된다.

Sensor Tower는 API와 데이터 피드를 통해 앱, 광고 및 디지털 시장 데이터를 내부 시스템으로 가져오는 기능을 제공하지만, 실제 접근 가능한 데이터는 계약과 상품 권한에 따라 달라질 수 있다. 

따라서 모든 외부 데이터 공급자는 Provider 인터페이스 뒤에 배치한다.

```typescript
interface CompetitorDataProvider {
  readonly type: CompetitorProviderType;

  searchAds(input: SearchAdsInput): Promise<ExternalAd[]>;
  getAdDetail(externalId: string): Promise<ExternalAdDetail>;
  syncCompetitor(input: SyncCompetitorInput): Promise<SyncResult>;
  refreshAd(input: RefreshAdInput): Promise<RefreshResult>;
  validateCredentials(): Promise<CredentialValidationResult>;
}
```

## Provider 구현 대상

```text
SensorTowerProvider
MetaAdLibraryManualProvider
MetaAdLibraryApiProvider
TikTokCreativeCenterProvider
TikTokCommercialContentProvider
AppStoreProvider
GooglePlayProvider
ManualUrlProvider
ManualFileProvider
CsvImportProvider
MockCompetitorDataProvider
```

## Sensor Tower

Sensor Tower API 권한이 있으면 다음 데이터 수집을 검토한다.

- 앱별 광고 소재
- 광고 네트워크
- 국가
- 플랫폼
- 광고 발견 시점
- 광고 노출 추정치
- Share of Voice
- 다운로드 추정치
- 매출 추정치
- 앱스토어 순위
- 광고 소재 변경 이력

Sensor Tower 응답 원본은 정규화된 데이터와 별도로 JSONB로 보관한다.

## Meta Ad Library

Meta Ad Library 웹사이트에서 경쟁사의 활성 광고를 사람이 찾아 등록할 수 있도록 한다.

다만 공식 Meta Ad Library API는 사회 이슈·선거·정치 광고 검색을 주요 범위로 설명하고 있으므로, 대만의 일반 상업 광고가 API로 완전히 자동 수집된다고 가정하지 않는다. 

초기에는 다음 수동 흐름을 지원한다.

```text
사용자가 Meta Ad Library에서 광고 발견
→ 광고 URL 입력
→ 광고주·문구·시작일·플랫폼 정보 입력
→ 영상 또는 스크린샷 업로드
→ 시스템 분석
→ 최초 발견일 기록
→ 주기적으로 활성 여부 수동 확인
→ 스냅샷 이력 저장
```

## TikTok 경쟁 광고

TikTok Creative Center와 공개 광고 자료는 수동 또는 허용된 API 범위에서 수집한다.

TikTok Commercial Content API와 Research API는 승인된 대상에 제한될 수 있으므로 필수 데이터 공급자로 가정하지 않는다. 

## 경쟁사 성과 해석

경쟁사의 실제 CTR, CPI, 가입 수, CPA 또는 ROAS를 알 수 있다고 가정하지 않는다.

다음 대리 신호만 사용한다.

- 광고 최초 발견일
- 마지막 확인일
- 관찰된 활성 기간
- 동일 메시지의 소재 변형 수
- 동일 영상의 첫 장면 변형 수
- CTA 변형 수
- 국가별 확장 여부
- 플랫폼별 확장 여부
- 랜딩 페이지 변경
- 가입 혜택 변경
- 앱스토어 순위 변화
- 리뷰 수와 평점 변화
- 외부 공급자가 제공한 추정 노출량
- 외부 공급자가 제공한 추정 다운로드

모든 추정 데이터에는 다음을 저장한다.

```typescript
type DataProvenance = {
  provider: string;
  sourceUrl?: string;
  observedAt: Date;
  importedAt: Date;
  isEstimated: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  rawPayloadId?: string;
  notes?: string;
};
```

---

# 8. 시스템 주요 모듈

## 8.1 BabeRadar

경쟁사와 시장 데이터를 수집하고 관리한다.

주요 기능:

- 시장 및 언어 등록
- 경쟁사 등록
- 경쟁사 앱과 소셜 계정 등록
- 외부 데이터 Provider 연결
- Sensor Tower 동기화
- 광고 URL 수동 등록
- 이미지·영상 파일 업로드
- CSV 일괄 등록
- 신규 광고 및 변경된 광고 탐지
- 광고 스냅샷 저장
- 랜딩 페이지 스냅샷 저장
- 앱스토어 정보 변경 추적
- 데이터 출처와 신뢰도 관리

## 8.2 BabeStudio

수집한 광고를 분석하고 새로운 광고 소재를 생성한다.

주요 기능:

- 이미지 OCR
- 영상 음성 전사
- 영상 장면 분할
- 화면 자막 추출
- 훅·본문·CTA 분리
- 타깃 사용자 분석
- 감정적 욕구 분석
- 캐릭터 유형 분석
- 영상 구성 분석
- 광고 브리프 생성
- 광고 문구 생성
- 숏폼 스크립트 생성
- 스토리보드 생성
- 이미지 생성
- 영상 생성
- 번체중문 현지화 초안 생성
- 유사 광고 검색
- 경쟁사 원본과 생성물 간 유사도 검사

## 8.3 BabeReview

사람의 검토와 승인을 담당한다.

주요 기능:

- 검토 대기열
- 담당자 배정
- 번체중문 현지화 검수
- 브랜드 가이드 검수
- 플랫폼 정책 검수
- 성인 콘텐츠 및 연령 제한 검수
- 승인
- 수정 요청
- 거절
- 승인 이력
- 버전 비교
- 댓글 및 내부 메모

## 8.4 BabePublisher

승인된 콘텐츠를 게시하거나 광고 집행용으로 내보낸다.

주요 기능:

- Instagram 게시 예약
- TikTok 게시 또는 초안 전송
- 게시 캡션과 해시태그 관리
- 광고 관리자 업로드용 파일 패키지 생성
- 게시 결과 기록
- 실패 재시도
- OAuth 토큰 갱신
- 게시 상태 확인
- 외부 게시물 ID 저장

Instagram은 공식 Content Publishing API를 통해 비즈니스·크리에이터 계정 콘텐츠 게시를 지원하며, TikTok은 Content Posting API를 통해 직접 게시 또는 초안 업로드 흐름을 제공한다. TikTok의 공개 게시에는 앱 심사와 관련 권한이 필요할 수 있다. 

초기에는 승인 없는 완전 자동 게시를 구현하지 않는다.

## 8.5 BabePulse

자체 광고와 게시 콘텐츠의 성과를 수집하고 비교한다.

주요 기능:

- 캠페인·광고 세트·광고 연결
- Instagram 게시물 성과
- TikTok 게시물 성과
- Meta 광고 성과
- TikTok 광고 성과
- CSV 성과 업로드
- 설치 및 가입 이벤트 연결
- 소재별 퍼널 비교
- 실험별 성과 비교
- 국가·플랫폼·타깃별 성과 비교
- 성과 저하 탐지
- 다음 광고 브리프를 위한 인사이트 생성

Meta Ads Insights API는 자체 광고 계정의 광고 성과와 통계를 가져오는 용도로 사용한다. 경쟁사 광고 성과를 가져오는 용도로 사용하지 않는다. 

## 8.6 BabeGuard

브랜드, 저작권 및 광고 정책 검사를 담당한다.

주요 기능:

- 경쟁사 문구 직접 복제 검사
- 이미지 유사도 검사
- 과도한 성적 표현 탐지
- 미성년자로 보일 수 있는 캐릭터와 성인 소재 조합 차단
- 허위·과장 주장 탐지
- 플랫폼별 금지 표현 검사
- 브랜드 금지어 검사
- 번역 품질 및 위험 문구 표시
- 최종 승인 전 필수 체크리스트

---

# 9. 필수 기술 스택

아래 기술 스택은 필수이며 임의로 다른 프레임워크로 대체하지 않는다.

## 9.1 Backend

- Node.js LTS
- TypeScript
- NestJS
- GraphQL
- NestJS GraphQL Code First
- Apollo Driver
- Prisma ORM
- PostgreSQL
- pgvector
- Redis
- BullMQ

NestJS GraphQL은 TypeScript 클래스와 데코레이터에서 GraphQL 스키마를 생성하는 Code First 방식으로 구성한다. 

## 9.2 Frontend

- React
- TypeScript
- Vite
- Apollo Client
- GraphQL Code Generator
- React Router
- React Hook Form
- Zod
- 필요할 경우 Zustand

Frontend는 별도 웹 서버로 운영하지 않는다.

React 애플리케이션을 정적 빌드한 뒤 NestJS에서 직접 서빙한다.

NestJS는 `@nestjs/serve-static`을 사용해 SPA 정적 파일을 제공한다. 

## 9.3 Database

- PostgreSQL
- Prisma ORM
- pgvector
- JSONB
- PostgreSQL Full Text Search
- 필요할 경우 `pg_trgm`

Prisma에서 일반 엔티티의 CRUD와 트랜잭션은 Prisma Client를 사용한다.

벡터 유사도 검색은 Prisma의 현재 지원 범위를 확인한 뒤 다음 중 하나를 사용한다.

- Prisma가 제공하는 pgvector 기능
- TypedSQL
- `$queryRaw`
- PostgreSQL View 또는 Repository 계층의 전용 SQL

pgvector 관련 SQL을 Resolver나 일반 Service에 직접 흩어 놓지 않는다.

`VectorSearchRepository`에 격리한다.

Prisma 공식 문서에서도 PostgreSQL 확장과 pgvector 기반 벡터 저장·검색을 지원 대상으로 설명하고 있다. 

## 9.4 Queue 및 백그라운드 작업

- Redis
- BullMQ
- Bull Board 또는 별도의 관리자 큐 화면
- 분산 락
- 재시도
- 지수 백오프
- Dead Letter Queue에 준하는 실패 작업 관리
- 작업별 idempotency key

## 9.5 파일 및 미디어

- S3 호환 Object Storage
- AWS S3 또는 MinIO
- 로컬 개발용 MinIO
- FFmpeg
- 이미지 썸네일 생성
- 영상 메타데이터 추출
- 영상 장면 분리
- 자막 렌더링
- 화면 비율 변환
- 오디오 추출

대용량 영상 바이너리를 GraphQL 요청 본문에 직접 넣지 않는다.

다음 업로드 흐름을 사용한다.

```text
React가 GraphQL mutation으로 업로드 요청
→ NestJS가 Presigned URL 발급
→ React가 Object Storage에 직접 업로드
→ 업로드 완료 GraphQL mutation 호출
→ NestJS가 MediaAsset 생성
→ BullMQ 분석 작업 실행
```

## 9.6 AI Provider

특정 AI 회사 하나에 도메인 로직이 종속되지 않도록 한다.

```typescript
interface TextGenerationProvider {}
interface ImageGenerationProvider {}
interface VideoGenerationProvider {}
interface SpeechToTextProvider {}
interface OcrProvider {}
interface EmbeddingProvider {}
interface ModerationProvider {}
```

AI 응답은 자유 형식 문자열로 바로 사용하지 않는다.

가능한 경우 구조화된 JSON으로 받고 Zod 스키마로 검증한다.

모든 AI 실행에는 다음을 기록한다.

- Provider
- 모델명
- 프롬프트 템플릿 버전
- 시스템 프롬프트
- 입력 데이터 ID
- 출력 결과
- 토큰 또는 사용량
- 처리 시간
- 오류
- 비용 추정치
- 생성 시각

---

# 10. React 정적 빌드 및 NestJS 서빙 구조

## 핵심 원칙

- API와 관리자 화면은 동일 Origin을 사용한다.
- React 정적 파일은 NestJS가 제공한다.
- GraphQL 엔드포인트는 `/graphql`이다.
- 별도의 Nginx 프론트엔드 서버를 필수로 두지 않는다.
- 운영 환경에서는 TLS와 리버스 프록시 목적으로 Nginx 또는 Traefik을 앞에 둘 수 있다.
- React Router의 SPA 경로는 `index.html`로 fallback한다.
- `/graphql`, `/webhooks`, `/oauth`, `/uploads`, `/health` 경로는 SPA fallback에서 제외한다.

## 요청 경로

```text
GET  /                         React index.html
GET  /competitors              React SPA
GET  /creatives/:id            React SPA
POST /graphql                  GraphQL API
GET  /graphql                  GraphQL Playground 또는 비활성화
POST /webhooks/meta            Meta Webhook
POST /webhooks/tiktok          TikTok Webhook
GET  /oauth/meta/callback      Meta OAuth Callback
GET  /oauth/tiktok/callback    TikTok OAuth Callback
GET  /health                   Health Check
GET  /ready                    Readiness Check
```

## 빌드 과정

```text
1. React/Vite 빌드
2. apps/web/dist 생성
3. 정적 파일을 NestJS 배포 디렉터리로 복사
4. NestJS 빌드
5. 단일 Docker 이미지 생성
6. NestJS가 React 정적 파일과 GraphQL API를 함께 제공
```

## 권장 디렉터리 구조

```text
babe-loop/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── worker.ts
│   │   │   ├── scheduler.ts
│   │   │   ├── app.module.ts
│   │   │   ├── modules/
│   │   │   ├── common/
│   │   │   ├── providers/
│   │   │   └── generated/
│   │   ├── public/
│   │   └── test/
│   └── web/
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   ├── features/
│       │   ├── graphql/
│       │   ├── generated/
│       │   └── routes/
│       └── dist/
├── packages/
│   ├── shared/
│   ├── config/
│   ├── eslint-config/
│   └── tsconfig/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
│   ├── architecture.md
│   ├── requirements.md
│   ├── erd.md
│   ├── event-taxonomy.md
│   ├── provider-contracts.md
│   └── mvp-plan.md
├── docker/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

## Monorepo

- pnpm workspace 사용
- Backend와 Frontend의 의존성을 분리
- GraphQL 스키마에서 Frontend 타입 자동 생성
- Prisma 모델을 Frontend에서 직접 import하지 않음
- Backend DTO를 Frontend와 직접 공유하지 않음
- GraphQL Code Generator 결과를 Frontend에서 사용

---

# 11. GraphQL 설계 원칙

GraphQL을 주요 비즈니스 API로 사용한다.

REST 엔드포인트는 다음에만 사용한다.

- 외부 Webhook
- OAuth Callback
- Health Check
- Presigned Upload
- 외부 플랫폼이 GraphQL을 호출할 수 없는 경우

## GraphQL 구성

- Code First
- Apollo Driver
- 인증 Guard
- 역할 기반 Authorization
- Cursor Pagination
- DataLoader
- Query Complexity 제한
- Query Depth 제한
- Production 환경 Introspection 정책
- GraphQL 오류 표준화
- Mutation idempotency 지원

## 주요 Query

```graphql
type Query {
  me: User!
  workspace: Workspace!
  dashboard(input: DashboardInput!): Dashboard!
  markets: [Market!]!
  competitors(input: CompetitorFilterInput): CompetitorConnection!
  competitor(id: ID!): Competitor
  creativeReferences(input: CreativeReferenceFilterInput): CreativeReferenceConnection!
  creativeReference(id: ID!): CreativeReference
  similarCreatives(input: SimilarCreativeInput!): [CreativeSimilarityResult!]!
  creativeBriefs(input: CreativeBriefFilterInput): CreativeBriefConnection!
  experiments(input: ExperimentFilterInput): ExperimentConnection!
  experiment(id: ID!): Experiment
  funnelPerformance(input: FunnelPerformanceInput!): FunnelPerformance!
  publishingJobs(input: PublishingJobFilterInput): PublishingJobConnection!
  job(id: ID!): Job
}
```

## 주요 Mutation

```graphql
type Mutation {
  createCompetitor(input: CreateCompetitorInput!): Competitor!
  updateCompetitor(input: UpdateCompetitorInput!): Competitor!
  connectProvider(input: ConnectProviderInput!): ProviderConnection!
  importCreativeUrl(input: ImportCreativeUrlInput!): CreativeReference!
  requestMediaUpload(input: RequestMediaUploadInput!): UploadRequest!
  completeMediaUpload(input: CompleteMediaUploadInput!): MediaAsset!
  analyzeCreative(input: AnalyzeCreativeInput!): Job!
  generateCreativeBrief(input: GenerateCreativeBriefInput!): Job!
  generateCreativeVariants(input: GenerateCreativeVariantsInput!): Job!
  requestReview(input: RequestReviewInput!): ReviewRequest!
  approveCreative(input: ApproveCreativeInput!): ReviewRequest!
  rejectCreative(input: RejectCreativeInput!): ReviewRequest!
  schedulePost(input: SchedulePostInput!): ScheduledPost!
  linkAdCampaign(input: LinkAdCampaignInput!): AdCampaign!
  importPerformanceCsv(input: ImportPerformanceCsvInput!): Job!
  retryJob(input: RetryJobInput!): Job!
}
```

GraphQL Subscription은 초기 MVP 필수 기능으로 두지 않는다.

초기에는 작업 상태를 Polling으로 확인하고, 필요할 경우 Redis Pub/Sub 기반 GraphQL Subscription을 추가한다.

---

# 12. 주요 데이터 모델

## 조직 및 권한

- `workspaces`
- `users`
- `workspace_members`
- `roles`
- `permissions`
- `audit_logs`

## 브랜드 및 시장

- `brands`
- `brand_guidelines`
- `brand_products`
- `brand_features`
- `markets`
- `locales`
- `localization_terms`
- `prohibited_terms`

## 경쟁사 및 데이터 소스

- `competitors`
- `competitor_apps`
- `competitor_accounts`
- `provider_connections`
- `provider_credentials`
- `sync_jobs`
- `external_raw_payloads`
- `source_ads`
- `source_ad_snapshots`
- `landing_page_snapshots`
- `app_store_snapshots`

## 미디어 및 분석

- `media_assets`
- `media_variants`
- `transcriptions`
- `ocr_results`
- `scene_analyses`
- `creative_analyses`
- `creative_embeddings`
- `creative_tags`
- `creative_patterns`

## 생성 및 검토

- `prompt_templates`
- `generation_runs`
- `creative_briefs`
- `generated_creatives`
- `generated_variants`
- `localization_versions`
- `review_requests`
- `review_comments`
- `policy_checks`

## 실험 및 게시

- `experiments`
- `experiment_variants`
- `publishing_accounts`
- `scheduled_posts`
- `published_posts`
- `publishing_attempts`

## 캠페인 및 성과

- `ad_accounts`
- `ad_campaigns`
- `ad_groups`
- `ads`
- `performance_daily`
- `organic_performance_daily`
- `attribution_events`
- `funnel_events`
- `conversion_events`
- `performance_imports`

## 작업 관리

- `jobs`
- `job_attempts`
- `job_failures`
- `notifications`

---

# 13. 광고 분석 데이터 구조

```typescript
type CreativeAnalysis = {
  summary: string;

  hook: {
    text?: string;
    type: string;
    appearsWithinSeconds?: number;
  };

  body: {
    structure: string[];
    keyMessages: string[];
  };

  callToAction: {
    text?: string;
    type?: string;
  };

  targetAudience: string[];
  painPoints: string[];
  desires: string[];
  emotionalTriggers: string[];
  relationshipDynamics: string[];
  characterArchetypes: string[];
  genres: string[];

  claims: {
    text: string;
    type: string;
    requiresVerification: boolean;
  }[];

  visualStyle: string[];
  videoStructure: SceneAnalysis[];

  durationSeconds?: number;
  aspectRatio?: string;
  language: string;
  locale?: string;
  countries: string[];

  transcription?: string;
  ocrText?: string;
  landingPageUrl?: string;

  sourceConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
};
```

---

# 14. pgvector 활용 범위

다음 데이터에 임베딩을 생성한다.

- 경쟁사 광고 문구
- 영상 전사문
- OCR 텍스트
- 광고 분석 결과
- 광고 훅
- 광고 브리프
- 생성된 광고 문구
- BabeChat 브랜드 가이드
- 제품 기능 설명
- 과거 성과 인사이트

## 벡터 검색 기능

- 유사 경쟁 광고 검색
- 유사 훅 검색
- 동일 메시지의 변형 탐지
- 성과가 좋았던 자체 광고 검색
- 특정 사용자 욕구와 유사한 광고 검색
- 생성물이 경쟁사 원본과 지나치게 유사한지 검사
- 브랜드 가이드 기반 RAG
- 과거 실험 결과 기반 광고 브리프 생성

## 임베딩 모델 관리

임베딩에는 다음을 함께 저장한다.

```typescript
type EmbeddingMetadata = {
  provider: string;
  model: string;
  dimension: number;
  sourceType: string;
  sourceId: string;
  createdAt: Date;
};
```

임베딩 모델이 변경될 경우 기존 벡터와 혼합 검색하지 않는다.

모델별 별도 버전을 관리하고 재임베딩 작업을 제공한다.

---

# 15. 광고 생성 파이프라인

```text
원본 광고 등록
→ 파일 정규화
→ OCR 및 음성 전사
→ 영상 장면 분할
→ 광고 구조 분석
→ 추상 패턴 추출
→ 경쟁사 원본과 패턴 분리
→ BabeChat 브랜드·기능 데이터 결합
→ 대만 시장용 광고 브리프 생성
→ 한국어 또는 구조화된 초안 생성
→ 번체중문 현지화
→ 문구·스크립트·스토리보드 생성
→ 이미지 또는 영상 생성
→ 유사도 및 정책 검사
→ 사람 검토
→ 승인
→ 게시 또는 광고 집행용 내보내기
```

## 생성 원칙

경쟁사 광고 문구나 장면을 그대로 복제하지 않는다.

추출 가능한 것은 다음과 같은 추상 패턴이다.

- 질문으로 시작하는 훅
- 첫 2초 안에 캐릭터 대사 노출
- 메시지 알림 형태의 시작
- 관계 변화 전후 비교
- 사용자 선택지 제시
- 후기형 UGC 구성
- 웹툰 패널식 편집
- 앱 실제 화면 녹화
- 마지막 3초 CTA
- 무료 가입 혜택 강조

생성 결과는 경쟁사 원본 및 기존 자체 광고와 유사도를 비교한다.

유사도 임계치를 초과하면 자동 승인하지 않는다.

---

# 16. 대만 광고 크리에이티브 실험축

## 타깃 욕구

- 나를 이해하는 캐릭터
- 내 취향에 맞는 로맨스
- 이야기 속 주인공이 되는 경험
- 현실에서 경험하기 어려운 관계
- 자유로운 롤플레이
- 나만의 캐릭터 제작
- 웹소설보다 직접적인 몰입
- 선택에 따라 변하는 이야기

## 훅 유형

- 질문형
- 캐릭터 대사형
- 채팅 알림형
- 사용자 후기형
- 놀라운 답변 공개형
- 선택지 제시형
- 일반 AI 챗과 비교형
- 웹소설과 비교형
- 관계 변화 공개형
- 캐릭터 생성 과정 공개형

## 시각 형식

- 실제 앱 화면 녹화
- 채팅 캡처
- 캐릭터 감정 이미지 변화
- 선택지에 따라 달라지는 장면
- 사용자 시점 UGC
- 웹툰 패널
- 짧은 로맨스 상황극
- 캐릭터 제작 전후
- 알림 메시지
- 댓글 답변 영상

## CTA 방향

- 무료로 첫 대화 시작하기
- 지금 캐릭터 만나기
- 내 취향 캐릭터 찾기
- 앱 설치하고 이야기 시작하기
- 직접 캐릭터 만들기
- 다음 장면 직접 선택하기

## 번체중문 메시지 가설

아래 문구는 확정 문구가 아니라 테스트 방향이다.

```text
不是只看故事，這次你就是主角。
이야기를 보기만 하는 것이 아니라, 이번에는 네가 주인공이다.

你選擇，故事就會改變。
당신의 선택에 따라 이야기가 달라집니다.

遇見真正符合你喜好的 AI 角色。
정말 내 취향에 맞는 AI 캐릭터를 만나보세요.

創造只屬於你的角色與世界。
나만의 캐릭터와 세계를 만들어보세요.

免費開始你的第一段故事。
첫 번째 이야기를 무료로 시작하세요.
```

대만 현지 검수자가 자연스러움, 감정 강도, 성별 표현, 플랫폼 정책 적합성을 확인해야 한다.

---

# 17. 실험 관리

한 광고 아이디어에서 여러 변형을 생성할 수 있어야 한다.

```text
동일 영상 + 훅 3개
동일 훅 + 캐릭터 유형 3개
동일 캐릭터 + 감정 중심/기능 중심 문구
동일 영상 + CTA 3개
동일 스크립트 + UGC/웹툰/화면 녹화 형식
동일 소재 + Instagram/TikTok 편집 버전
동일 소재 + 15초/30초 버전
```

가능한 경우 하나의 실험에서 하나의 주요 변수만 변경한다.

```typescript
type CreativeVariantDefinition = {
  experimentId: string;
  market: 'TW';
  locale: 'zh-TW';
  platform: 'INSTAGRAM' | 'TIKTOK' | 'FACEBOOK';

  audienceHypothesis: string;
  desire: string;
  hookType: string;
  messageAngle: string;
  visualFormat: string;
  characterArchetype: string;
  genre: string;
  callToAction: string;

  durationSeconds: number;
  sourceReferenceIds: string[];

  modelName?: string;
  promptVersion?: string;
  localizationReviewerId?: string;
};
```

---

# 18. BullMQ 작업 설계

## 주요 Queue

```text
source-sync
media-processing
creative-analysis
embedding
creative-generation
localization
policy-check
publishing
performance-sync
attribution
maintenance
notification
```

## 주요 Job

```text
sync-sensor-tower-competitor
refresh-source-ad
download-external-media
extract-media-metadata
generate-thumbnail
transcribe-audio
run-ocr
detect-scenes
analyze-creative
generate-embedding
generate-creative-brief
generate-copy-variants
generate-video-script
generate-storyboard
generate-image
render-video
localize-zh-tw
run-policy-check
schedule-social-post
publish-instagram
publish-tiktok
sync-meta-performance
sync-tiktok-performance
import-performance-csv
evaluate-experiment
rebuild-embedding
```

## 작업 공통 규칙

- 모든 Job에 idempotency key 적용
- 외부 API별 rate limit
- 재시도 횟수와 백오프 설정
- 영구 실패 작업 분리
- 작업 상태 DB 기록
- 사용자에게 오류 원인 표시
- 원본 요청과 응답 로그 저장
- 토큰 만료와 재인증 구분
- 사용자가 직접 재실행할 수 있도록 구성

---

# 19. 인증과 권한

내부 운영 도구이므로 역할 기반 권한을 구현한다.

## 권장 역할

```text
ADMIN
MARKETER
CREATIVE_EDITOR
LOCALIZATION_REVIEWER
APPROVER
ANALYST
VIEWER
```

## 권한 예시

- 경쟁사 등록
- 외부 Provider 연결
- 광고 소재 업로드
- AI 생성 실행
- 번체중문 수정
- 최종 승인
- 게시 예약
- 즉시 게시
- 성과 데이터 조회
- API 토큰 관리
- 사용자 및 역할 관리

인증은 다음 중 하나를 사용한다.

- 권장: Google Workspace OAuth/OIDC
- 대안: 이메일·비밀번호 및 세션
- API Worker: 별도의 서비스 인증

외부 플랫폼 Access Token은 평문으로 DB에 저장하지 않는다.

애플리케이션 수준 암호화 또는 Secret Manager를 사용한다.

---

# 20. 로깅 및 모니터링

- Pino 기반 구조화 로그
- Sentry
- OpenTelemetry
- 요청 ID
- Job ID
- Generation Run ID
- 외부 API 호출 시간
- 외부 API 오류율
- Queue 대기 시간
- 작업 처리 시간
- AI 비용
- 게시 성공률
- 성과 동기화 지연
- Health Check
- Readiness Check

민감한 토큰, 사용자 메시지 및 개인정보가 로그에 그대로 남지 않도록 마스킹한다.

---

# 21. 테스트 전략

## Backend

- Jest
- NestJS Testing Module
- Prisma Repository 통합 테스트
- GraphQL Resolver 테스트
- Provider Contract Test
- Queue Processor 테스트
- 외부 API Mock Server
- Testcontainers 기반 PostgreSQL·Redis 테스트

## Frontend

- Vitest
- React Testing Library
- Mock GraphQL
- Form Validation 테스트

## E2E

- Playwright
- 수동 광고 등록
- 파일 업로드
- 분석 실행
- 브리프 생성
- 검토 및 승인
- CSV 성과 업로드
- 실험 결과 조회

## 반드시 테스트할 상황

- 동일 URL 중복 등록
- 동일 Job 중복 실행
- 외부 API Rate Limit
- OAuth Token 만료
- 영상 처리 실패
- AI가 잘못된 JSON을 반환
- 사용자가 생성 작업 중 파일 삭제
- 게시 API 성공 후 응답 유실
- CSV 중복 업로드
- 광고 성과 날짜 누락
- pgvector 차원 불일치
- 승인되지 않은 콘텐츠 게시 시도

---

# 22. 배포 구조

초기에는 Kubernetes를 사용하지 않는다.

Docker Compose 기반으로 시작한다.

## 프로세스

동일한 코드베이스와 Docker 이미지를 사용하되 실행 모드를 나눈다.

```text
API Process
Worker Process
Scheduler Process
```

## 컨테이너 구성

```text
babe-loop-api
babe-loop-worker
babe-loop-scheduler
postgresql
redis
minio
reverse-proxy
```

## 요청 흐름

```text
Browser
  ↓
Reverse Proxy / TLS
  ↓
NestJS
  ├── React Static Assets
  ├── GraphQL API
  ├── OAuth Callback
  ├── Webhooks
  └── Health Check

NestJS / Worker
  ├── PostgreSQL + pgvector
  ├── Redis + BullMQ
  ├── S3-Compatible Storage
  ├── AI Providers
  ├── Sensor Tower
  ├── Meta APIs
  └── TikTok APIs
```

API 서버는 Stateless하게 유지한다.

영상 파일과 생성 결과를 컨테이너 로컬 디스크에 영구 저장하지 않는다.

---

# 23. 환경변수

```text
NODE_ENV
PORT
APP_BASE_URL

DATABASE_URL
DIRECT_DATABASE_URL
REDIS_URL

SESSION_SECRET
JWT_SECRET
TOKEN_ENCRYPTION_KEY

OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_REGION
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY

SENSORTOWER_API_KEY
SENSORTOWER_API_BASE_URL

META_APP_ID
META_APP_SECRET
META_REDIRECT_URI
META_WEBHOOK_VERIFY_TOKEN

TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
TIKTOK_REDIRECT_URI
TIKTOK_WEBHOOK_SECRET

TEXT_AI_PROVIDER
TEXT_AI_API_KEY
IMAGE_AI_PROVIDER
IMAGE_AI_API_KEY
VIDEO_AI_PROVIDER
VIDEO_AI_API_KEY
STT_PROVIDER
STT_API_KEY
EMBEDDING_PROVIDER
EMBEDDING_API_KEY

SENTRY_DSN
OTEL_EXPORTER_OTLP_ENDPOINT
LOG_LEVEL
```

실제 API 키가 없는 환경에서도 Mock Provider로 전체 시스템을 실행할 수 있어야 한다.

---

# 24. MVP 범위

## MVP에서 구현할 기능

```text
브랜드 정보 등록
→ BabeChat 기능 및 브랜드 가이드 등록
→ 대만 시장과 zh-TW 로케일 등록
→ WHIF 및 레퍼런스 앱 등록
→ 광고 URL 수동 등록
→ 이미지·영상 파일 업로드
→ OCR 및 음성 전사
→ 훅·본문·CTA 분석
→ 광고 태그 및 패턴 생성
→ pgvector 유사 광고 검색
→ 대만용 광고 브리프 생성
→ 번체중문 광고 문구 생성
→ 15초·30초 영상 스크립트 생성
→ 현지화 검토
→ 승인·수정 요청·거절
→ 광고 소재 파일 내보내기
→ 성과 CSV 업로드
→ 설치·가입·첫 메시지 성과 비교
```

## MVP에서 제외할 기능

- 승인 없는 자동 게시
- 광고 예산 자동 변경
- 성과가 낮은 광고 자동 중단
- 경쟁사 CTR·CPA·ROAS 추정
- Sensor Tower가 없으면 실행되지 않는 구조
- 대만 Meta 상업 광고의 완전 자동 수집
- 완전 자동 영상 생성
- 실시간 멀티플랫폼 광고 집행
- AI 생성물의 무검수 게시

---

# 25. 단계별 개발 계획

## Phase 0: 문서와 기반 구조

- 요구사항 문서
- 아키텍처 문서
- ERD
- 이벤트 정의서
- Provider 인터페이스
- GraphQL 기본 스키마
- Monorepo
- Docker Compose
- CI
- PostgreSQL·pgvector·Redis·MinIO 구성

## Phase 1: 수동 수집과 분석

- 경쟁사 등록
- 광고 URL·파일 수동 등록
- MediaAsset
- OCR
- 음성 전사
- 광고 분석
- 임베딩
- 유사 광고 검색

## Phase 2: 생성과 검토

- 광고 브리프 생성
- 문구 변형 생성
- 숏폼 영상 스크립트
- 번체중문 현지화
- 검토·승인 워크플로
- 파일 내보내기

## Phase 3: 성과 측정

- CSV 업로드
- 캠페인·소재 매핑
- 설치·가입·첫 메시지 이벤트
- 실험 대시보드
- 소재별 퍼널 분석

## Phase 4: 외부 데이터 연결

- Sensor Tower
- Meta 광고 성과
- TikTok 광고 성과
- 앱스토어 데이터
- 경쟁사 광고 갱신

## Phase 5: 게시 자동화

- Instagram 게시
- TikTok 초안 업로드
- TikTok 직접 게시
- 게시 상태 Webhook
- 게시 실패 재시도

## Phase 6: 최적화 자동화

- 성과 기반 브리프 생성
- 새로운 훅 자동 제안
- 실험 종료 판단 지원
- 성과 저하 알림
- 예산 조정 제안

예산이나 광고 상태를 자동으로 변경하는 기능은 별도 승인 절차를 거친 이후에만 개발한다.

---

# 26. MVP 완료 조건

다음 흐름이 로컬 Mock Provider 환경에서 처음부터 끝까지 동작해야 한다.

```text
1. 관리자가 BabeChat 브랜드 정보를 등록한다.
2. 대만 시장과 zh-TW 언어를 설정한다.
3. WHIF를 경쟁사로 등록한다.
4. 경쟁 광고 영상 또는 이미지를 업로드한다.
5. 시스템이 OCR·전사·광고 분석을 수행한다.
6. 훅·본문·CTA와 감정 패턴을 보여준다.
7. 유사 광고를 검색한다.
8. BabeChat용 광고 브리프를 생성한다.
9. 번체중문 광고 문구와 영상 스크립트를 생성한다.
10. 검수자가 문구를 수정하고 승인한다.
11. 승인된 소재를 파일로 내보낸다.
12. 마케터가 성과 CSV를 업로드한다.
13. 소재별 설치·가입·첫 메시지 성과가 표시된다.
14. 가장 성과가 좋은 패턴을 사용해 다음 브리프를 생성한다.
```

---

# 27. 코덱스가 가장 먼저 수행할 작업

코드를 바로 작성하지 말고 먼저 다음 문서를 작성하라.

1. `docs/requirements.md`
2. `docs/architecture.md`
3. `docs/erd.md`
4. `docs/event-taxonomy.md`
5. `docs/provider-contracts.md`
6. `docs/graphql-design.md`
7. `docs/queue-design.md`
8. `docs/security.md`
9. `docs/mvp-plan.md`

각 문서에는 다음을 포함한다.

- 불명확한 가정
- API 접근 권한이 없을 때의 대안
- MVP와 이후 범위
- 주요 도메인 경계
- 데이터 흐름
- 실패 및 재시도 전략
- 보안 위험
- 테스트 전략
- 구현 순서

문서를 작성한 다음 아래 기반 코드를 생성한다.

```text
pnpm Monorepo
NestJS GraphQL Code First
Prisma
PostgreSQL + pgvector
Redis + BullMQ
React + Vite
Apollo Client
GraphQL Code Generator
NestJS ServeStaticModule
Docker Compose
Mock Providers
```

첫 번째 코드 구현 범위는 다음으로 제한한다.

```text
시장 및 로케일 등록
→ 경쟁사 등록
→ 광고 URL·파일 수동 등록
→ 광고 분석
→ 임베딩 및 유사 광고 검색
→ 광고 브리프 생성
→ 번체중문 문구 생성
→ 검토 및 승인
→ 성과 CSV 업로드
→ 소재별 설치·가입 성과 비교
```

Sensor Tower, Meta 및 TikTok API 키 없이도 Mock Provider와 Manual Provider로 전체 흐름을 테스트할 수 있어야 한다.

---

# 28. 핵심 설계 원칙 요약

1. GraphQL을 주요 API로 사용한다.
2. React를 Vite로 정적 빌드하고 NestJS에서 서빙한다.
3. NestJS API와 React 화면은 같은 Origin으로 운영한다.
4. Prisma는 일반 데이터 접근을 담당한다.
5. pgvector 검색은 전용 Repository로 분리한다.
6. Redis와 BullMQ로 장시간 작업을 처리한다.
7. 대용량 파일은 Object Storage에 직접 업로드한다.
8. 모든 외부 API는 Provider 인터페이스 뒤에 둔다.
9. Sensor Tower가 없어도 시스템이 작동해야 한다.
10. 경쟁사 성과를 실제 성과처럼 표현하지 않는다.
11. 설치보다 가입과 첫 채팅을 중요하게 평가한다.
12. 번체중문은 반드시 대만 현지화 검수를 거친다.
13. 경쟁사 광고를 복제하지 않고 추상적인 패턴만 활용한다.
14. 승인되지 않은 콘텐츠를 자동 게시하지 않는다.
15. 모든 AI 생성과 외부 API 실행은 추적 가능해야 한다.
16. 초기 배포는 Docker Compose로 시작한다.
17. API, Worker, Scheduler는 같은 코드베이스에서 실행 모드만 분리한다.
18. MVP에서는 수동 입력과 CSV로 전체 루프를 먼저 검증한다.