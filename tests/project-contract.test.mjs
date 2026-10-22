import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const backend = read('supabase/functions/make-server-813cc0a8/index.ts');
const app = read('src/App.tsx');
const sql = read('supabase/migrations/20261021000100_initial_schema.sql');
test('Frontend e backend implementam todos os endpoints chamados', () => {
  for (const [method, route] of [['get','/bootstrap'],['post','/signup'],['post','/applications'],['delete','/applications/:jobId'],['post','/jobs'],['delete','/jobs/:id'],['put','/jobs/:id/extend'],['post','/simulations'],['put','/profile']]) {
    assert.ok(backend.includes(`app.${method}("${route}"`), `${method.toUpperCase()} ${route}`);
  }
  for (const route of ['/bootstrap','/signup','/applications','/jobs','/simulations','/profile']) assert.ok(app.includes(route));
});
test('Tabelas necessárias e RLS existem na migração', () => {
  for (const table of ['profiles','jobs','applications','simulations']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /unique\(user_id, job_id\)/);
});
test('Rotas de escrita privadas exigem autenticação', () => {
  for (const route of ['/applications','/jobs','/simulations','/profile']) {
    const idx = backend.indexOf(`"${route}"`);
    assert.ok(idx >= 0);
    assert.match(backend.slice(idx, idx+250), /requireUser\(c\)/);
  }
});
test('Credenciais privadas não estão no frontend e configuração está documentada', () => {
  assert.ok(existsSync(new URL('../.env.example', import.meta.url)));
  assert.match(read('.gitignore'), /\.env\*/);
  assert.doesNotMatch(read('src/lib/config.ts'), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(read('src/lib/config.ts'), /VITE_SUPABASE_URL/);
});
