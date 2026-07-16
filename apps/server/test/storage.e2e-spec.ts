import { createTestApp, stopContainers, TestApp } from './create-test-app';

describe('storage', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.teardown();
    await stopContainers();
  });

  it('Presigned URL로 업로드한 객체를 head/getBuffer로 읽을 수 있다', async () => {
    const { StorageService } = await import('../src/common/storage/storage.service');
    const storage = t.app.get(StorageService);

    const key = 'test/hello.txt';
    const url = await storage.presignPut(key, 'text/plain');
    const res = await fetch(url, {
      method: 'PUT',
      body: 'hello babeloop',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.ok).toBe(true);

    const head = await storage.head(key);
    expect(head?.sizeBytes).toBe(14);

    const buf = await storage.getBuffer(key);
    expect(buf.toString()).toBe('hello babeloop');
  });

  it('없는 객체의 head는 null을 반환한다', async () => {
    const { StorageService } = await import('../src/common/storage/storage.service');
    const storage = t.app.get(StorageService);
    expect(await storage.head('test/no-such-key')).toBeNull();
  });

  it('putBuffer로 저장하고 presignGet URL로 내려받을 수 있다', async () => {
    const { StorageService } = await import('../src/common/storage/storage.service');
    const storage = t.app.get(StorageService);
    await storage.putBuffer('test/direct.txt', Buffer.from('direct-put'), 'text/plain');
    const url = await storage.presignGet('test/direct.txt');
    const res = await fetch(url);
    expect(await res.text()).toBe('direct-put');
  });
});
