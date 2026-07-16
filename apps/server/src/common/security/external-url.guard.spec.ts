import { assertSafeExternalUrl } from './external-url.guard';

describe('assertSafeExternalUrl', () => {
  const savedFlag = process.env.ALLOW_PRIVATE_EXTERNAL_URLS;

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.ALLOW_PRIVATE_EXTERNAL_URLS;
    else process.env.ALLOW_PRIVATE_EXTERNAL_URLS = savedFlag;
  });

  beforeEach(() => {
    delete process.env.ALLOW_PRIVATE_EXTERNAL_URLS;
  });

  it('http/https 외 프로토콜을 거부한다', async () => {
    await expect(assertSafeExternalUrl('file:///etc/passwd')).rejects.toThrow('허용되지 않는 프로토콜');
    await expect(assertSafeExternalUrl('ftp://example.com/x')).rejects.toThrow('허용되지 않는 프로토콜');
  });

  it('loopback IP를 거부한다', async () => {
    await expect(assertSafeExternalUrl('http://127.0.0.1:9000/bucket')).rejects.toThrow('차단');
    await expect(assertSafeExternalUrl('http://[::1]/x')).rejects.toThrow('차단');
  });

  it('클라우드 메타데이터·사설 대역을 거부한다', async () => {
    await expect(assertSafeExternalUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('차단');
    await expect(assertSafeExternalUrl('http://10.0.0.5/internal')).rejects.toThrow('차단');
    await expect(assertSafeExternalUrl('http://172.16.0.1/x')).rejects.toThrow('차단');
    await expect(assertSafeExternalUrl('http://192.168.1.1/router')).rejects.toThrow('차단');
    await expect(assertSafeExternalUrl('http://[::ffff:127.0.0.1]/x')).rejects.toThrow('차단');
  });

  it('사설 대역으로 해석되는 호스트명을 거부한다 (DNS)', async () => {
    await expect(assertSafeExternalUrl('http://localhost:9000/bucket')).rejects.toThrow('차단');
  });

  it('공인 IP는 허용한다', async () => {
    await expect(assertSafeExternalUrl('https://93.184.216.34/x')).resolves.toBeInstanceOf(URL);
  });

  it('ALLOW_PRIVATE_EXTERNAL_URLS=true면 사설 대역도 허용한다 (테스트 전용 플래그)', async () => {
    process.env.ALLOW_PRIVATE_EXTERNAL_URLS = 'true';
    await expect(assertSafeExternalUrl('http://127.0.0.1:9000/bucket')).resolves.toBeInstanceOf(URL);
  });
});
