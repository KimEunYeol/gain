import test from 'node:test';
import assert from 'node:assert/strict';
import { publicBackend, requireWrites, WRITES_ENABLED } from '../src/backend-policy.ts';
import { allPages } from '../src/pagination.ts';
import { limitedFetch, validateImageBatch, validateImageDimensions, validateImageInput } from '../src/resource-limits.ts';
import { safeUrl, videoUrl } from '../src/utils.ts';
const project = 'a'.repeat(20);
const url = `https://${project}.supabase.co`;
const key = 'sb_publishable_' + 'b'.repeat(32);
test('backend is disconnected without exact dedicated project and public key', () => {
  for (const config of [{}, { url, key }, { url, key, expectedProject: 'c'.repeat(20) }, { url: url.replace('https:', 'http:'), key, expectedProject: project }, { url: url + '/path', key, expectedProject: project }, { url: `https://user:pass@${project}.supabase.co`, key, expectedProject: project }, { url, key: 'sb_secret_' + 'b'.repeat(32), expectedProject: project }]) assert.equal(publicBackend(config), null);
  assert.deepEqual(publicBackend({ url, key, expectedProject: project }), { url, key });
  const jwt = (role: string, ref = project) => ['header', btoa(JSON.stringify({ role, ref })), 'signature'].join('.');
  assert.equal(publicBackend({ url, key: jwt('service_role'), expectedProject: project }), null);
  assert.equal(publicBackend({ url, key: jwt('anon', 'c'.repeat(20)), expectedProject: project }), null);
  assert.ok(publicBackend({ url, key: jwt('anon'), expectedProject: project }));
  assert.equal(WRITES_ENABLED, false); assert.throws(requireWrites, /검증/);
});
test('row and page budgets fail explicitly, including malformed or nonadvancing cursors', async () => {
  let calls = 0;
  await assert.rejects(() => allPages(async after => { calls++; return { data: [{ id: Number(after ?? 0) + 1 }], error: null }; }, { maxRows: 5, maxPages: 3 }), /페이지 한도/); assert.equal(calls, 3);
  await assert.rejects(() => allPages(async () => ({ data: [{ id: 1 }, { id: 2 }], error: null }), { maxRows: 1, maxPages: 2 }), /조회 한도/);
  await assert.rejects(() => allPages(async () => ({ data: [{ id: 2 }, { id: 1 }], error: null })), /조회 순서/);
  await assert.rejects(() => allPages(async () => ({ data: [{ id: NaN }], error: null })), /조회 순서/);
});
test('image count, total bytes, type, dimensions and captions are bounded', () => {
  const image = { type: 'image/png', size: 1024, name: 'image.png' };
  validateImageBatch([image]); validateImageDimensions(1600, 1600);
  assert.throws(() => validateImageBatch(Array(11).fill(image)));
  assert.throws(() => validateImageBatch(Array(3).fill({ ...image, size: 20 * 1024 * 1024 })));
  assert.throws(() => validateImageInput({ ...image, type: 'image/svg+xml' }));
  assert.throws(() => validateImageInput({ ...image, size: 0 }));
  assert.throws(() => validateImageDimensions(5000, 5000));
  assert.throws(() => validateImageBatch([{ ...image, name: '가'.repeat(301) + '.png' }]));
});
test('external links reject credentials, nonstandard ports and deceptive video hosts', () => {
  assert.equal(safeUrl('https://user:pass@example.com'), ''); assert.equal(safeUrl('https://example.com:8443'), '');
  assert.equal(videoUrl('https://youtube.com.evil.example/a'), '');
});
test('bounded fetch enforces declared and streamed response sizes and keeps abort signal', async () => {
  const original = globalThis.fetch; let seenSignal: AbortSignal | null | undefined;
  try {
    globalThis.fetch = async (_input, init) => { seenSignal = init?.signal; return new Response('ok'); };
    assert.equal(await (await limitedFetch('https://mock.invalid')).text(), 'ok'); assert.ok(seenSignal);
    globalThis.fetch = async () => new Response('small', { headers: { 'content-length': String(3 * 1024 * 1024) } });
    await assert.rejects(() => limitedFetch('https://mock.invalid'), /응답 크기/);
    globalThis.fetch = async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1));
    await assert.rejects(() => limitedFetch('https://mock.invalid'), /응답 크기/);
  } finally { globalThis.fetch = original; }
});
