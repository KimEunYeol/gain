import test from 'node:test';
import assert from 'node:assert/strict';
import { allPages } from '../src/pagination.ts';
import { contentError, settingsError } from '../src/validation.ts';
const settings = { id: 1, about: '', trainer: '', join_info: '', contact_url: '', instagram_url: '', faqs: [] };
const content = { id: 'id', title: '제목', body: '', category: '정모' as const, location: '', cover_path: '', video_url: '', pinned: false, starts_at: null, ends_at: null, created_at: '' };
test('content and FAQ limits accept boundaries and reject oversized Unicode text', () => {
  assert.equal(contentError({ ...content, body: '가'.repeat(20000) }), '');
  assert.notEqual(contentError({ ...content, body: '가'.repeat(20001) }), '');
  assert.equal(settingsError({ ...settings, faqs: Array.from({ length: 30 }, () => ({ question: '😀'.repeat(300), answer: '답'.repeat(3000) })) }), '');
  assert.notEqual(settingsError({ ...settings, faqs: Array.from({ length: 31 }, () => ({ question: '질문', answer: '답' })) }), '');
  assert.notEqual(settingsError({ ...settings, faqs: [{ question: '', answer: '답' }] }), '');
});
test('pagination continues despite a lower server cap and propagates later errors', async () => {
  const values = Array.from({ length: 1201 }, (_, id) => ({ id }));
  let calls = 0;
  const result = await allPages(async after => { calls++; return { data: values.filter(row => after === undefined || row.id > after).slice(0, 100), error: null }; }, { maxRows: 2000, maxPages: 20 });
  assert.deepEqual(result, values); assert.equal(calls, 14);
  await assert.rejects(() => allPages(async after => after === undefined ? { data: [{ id: 1 }], error: null } : { data: null, error: 'failure' }));
});
test('pagination fails if the server does not advance the cursor', async () => {
  await assert.rejects(() => allPages(async () => ({ data: [{ id: 1 }], error: null })), /조회 순서/);
});
