import { lookup } from 'dns/promises';
import { isIP } from 'net';

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_REDIRECTS = 3;

function isPrivateAddress(addr: string): boolean {
  if (isIP(addr) === 4) {
    const [a, b] = addr.split('.').map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local (클라우드 메타데이터 포함)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe8') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) {
    // v4-mapped: URL 파서가 '::ffff:127.0.0.1'을 '::ffff:7f00:1'로 정규화하므로 두 표기 모두 처리
    const rest = lower.slice(7);
    if (rest.includes('.')) return isPrivateAddress(rest);
    const parts = rest.split(':');
    if (parts.length === 2) {
      const hi = parseInt(parts[0] || '0', 16);
      const lo = parseInt(parts[1] || '0', 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
    }
    return true; // 해석 불가한 v4-mapped는 보수적으로 차단
  }
  return false;
}

/**
 * SSRF 방지: 외부에서 들어온 URL(CSV Creative URL 등)만 이 관문을 통해 다운로드한다.
 * ALLOW_PRIVATE_EXTERNAL_URLS=true 는 테스트 전용 (Testcontainers MinIO가 loopback이라 필요).
 * 알려진 한계: DNS 검증과 fetch 사이의 재해석(rebinding)은 IP 고정 없이는 못 막는다 — 내부 도구 위험 수준에서 수용.
 */
export async function assertSafeExternalUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`허용되지 않는 프로토콜: ${url.protocol}`);
  }
  if (process.env.ALLOW_PRIVATE_EXTERNAL_URLS === 'true') return url;

  const host = url.hostname.replace(/^\[|\]$/g, ''); // IPv6 대괄호 제거
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error(`내부 네트워크 주소로의 다운로드가 차단되었습니다: ${url.hostname} → ${address}`);
    }
  }
  return url;
}

/** 리다이렉트를 수동으로 따라가며 매 홉을 재검증하고, 크기 상한을 강제한다. */
export async function downloadExternal(
  raw: string,
  maxBytes: number = MAX_DOWNLOAD_BYTES,
): Promise<{ buffer: Buffer; contentType: string }> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeExternalUrl(current);
    const res = await fetch(current, { redirect: 'manual' });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`리다이렉트 응답에 Location 없음 (HTTP ${res.status})`);
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`다운로드 실패: HTTP ${res.status}`);

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new Error(`파일이 너무 큽니다: ${declared} bytes (최대 ${maxBytes})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error(`파일이 너무 큽니다: ${buffer.length} bytes (최대 ${maxBytes})`);

    return { buffer, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }
  throw new Error(`리다이렉트가 너무 많습니다 (최대 ${MAX_REDIRECTS}회)`);
}
