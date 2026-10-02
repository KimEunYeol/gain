import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/review/20261003_gain_isolated.sql', import.meta.url), 'utf8');
test('review SQL never mutates legacy public tables and scopes storage to new Gain bucket', () => {
  const statements = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(statements, /(?:create|alter|insert into|update|delete from|drop)\s+(?:table\s+)?public\./i);
  assert.match(statements, /create schema gain;/); assert.match(statements, /revoke all on schema gain from public/);
  assert.doesNotMatch(statements, /'gain-media'/);
  assert.match(statements, /'gain-public-media-v1'/);
  assert.match(statements, /enable row level security/); assert.match(statements, /gain\.is_gain_admin\(\)/);
  assert.match(statements, /objects<125 and bytes\+2097152<=250\*1024\*1024/);
  assert.match(statements, /security definer set search_path=''/);
});
test('quota operations preserve non-Gain buckets and reserve capacity transactionally', () => {
  assert.match(sql, /if NEW.bucket_id <> 'gain-public-media-v1' then return NEW/);
  assert.match(sql, /if OLD.bucket_id <> 'gain-public-media-v1' then return OLD/);
  assert.match(sql, /Conditional row updates serialize competing uploads/);
  assert.match(sql, /revoke all on gain\.gain_media_quota, gain\.gain_media_reservations from public, anon, authenticated/);
});

test('review migration has exactly one transaction boundary', () => {
  assert.equal((sql.match(/^begin;$/gm) || []).length, 1);
  assert.equal((sql.match(/^commit;$/gm) || []).length, 1);
  assert.ok(sql.indexOf('begin;') < sql.indexOf('create schema gain;'));
  assert.ok(sql.lastIndexOf('commit;') > sql.lastIndexOf('alter table gain.photos'));
});
