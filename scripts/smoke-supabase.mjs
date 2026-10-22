// Teste HTTP não destrutivo contra uma Edge Function publicada.
import assert from 'node:assert/strict';
const url = process.env.SUPABASE_FUNCTION_URL;
if (!url) { console.error('Defina SUPABASE_FUNCTION_URL=https://PROJECT.supabase.co/functions/v1/make-server-813cc0a8'); process.exit(2); }
const base = url.replace(/\/$/, '');
async function check(path, options, expected) {
  const response = await fetch(base + path, options);
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: HTTP ${response.status}: ${JSON.stringify(data)}`);
  console.log(`OK ${response.status} ${path}`);
  return data;
}
const health = await check('/health', {}, 200);
assert.equal(health.status, 'ok');
const bootstrap = await check('/bootstrap', {}, 200);
assert.ok(Array.isArray(bootstrap.jobs));
await check('/applications', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:1,jobTitle:'Teste',company:'Teste'})}, 401);
await check('/jobs', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Teste',salary:2000})}, 401);
await check('/simulations', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({salary:2000})}, 401);
await check('/profile', {method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Teste'})}, 401);
console.log('Smoke test remoto concluído. Cadastro/login/persistência exigem testes com contas reais.');
