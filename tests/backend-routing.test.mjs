import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Hono registers routes beneath the Edge Function slug', () => {
  const backend = read('supabase/functions/make-server-813cc0a8/index.ts');
  const frontend = read('src/lib/api.ts');

  const name = 'make-server-813cc0a8';
  assert.ok(frontend.includes('/functions/v1/' + name), 'frontend function URL must match');
  assert.ok(backend.includes('new Hono().basePath("/' + name + '")'), 'Edge Function must mount prefixed routes');
  assert.ok(backend.includes('app.get("/health"'), 'health route must be mounted');
  assert.ok(backend.includes('app.get("/bootstrap"'), 'bootstrap route must be mounted');
});
