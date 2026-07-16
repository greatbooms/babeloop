export const EXPERIMENT_CODE_RE = /^[A-Z0-9]{2,8}$/;
const VARIANT_CODE_RE = /^V\d+$/;
const TRACKING_CODE_RE = /^BL-([A-Z0-9]{2,8})-(V\d+)-R([1-9]\d*)$/;

export interface TrackingCodeParts {
  experimentCode: string;
  variantCode: string;
  revision: number;
}

export function buildTrackingCode(parts: TrackingCodeParts): string {
  if (!EXPERIMENT_CODE_RE.test(parts.experimentCode)) {
    throw new Error(`잘못된 실험 코드: ${parts.experimentCode}`);
  }
  if (!VARIANT_CODE_RE.test(parts.variantCode)) {
    throw new Error(`잘못된 변형 코드: ${parts.variantCode}`);
  }
  if (!Number.isInteger(parts.revision) || parts.revision < 1) {
    throw new Error(`잘못된 리비전: ${parts.revision}`);
  }
  return `BL-${parts.experimentCode}-${parts.variantCode}-R${parts.revision}`;
}

export function parseTrackingCode(raw: string): TrackingCodeParts | null {
  const match = TRACKING_CODE_RE.exec(raw.trim());
  if (!match) return null;
  return {
    experimentCode: match[1],
    variantCode: match[2],
    revision: Number(match[3]),
  };
}

export function adNameFor(trackingCode: string, hookType?: string | null): string {
  return `${trackingCode} | zh-TW | hook=${hookType ?? 'none'}`;
}

export function utmContentFor(trackingCode: string): string {
  return `utm_content=${trackingCode}`;
}
