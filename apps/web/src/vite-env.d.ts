/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 프론트 분리 배포 시 API 서버 절대주소 (미설정이면 같은 도메인 상대경로) */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
