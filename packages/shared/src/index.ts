export const LOCALES = ['ko-KR', 'zh-TW', 'zh-CN', 'en-US', 'ja-JP'] as const;
export type Locale = (typeof LOCALES)[number];

export const USER_ROLES = ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const;
export type UserRole = (typeof USER_ROLES)[number];
