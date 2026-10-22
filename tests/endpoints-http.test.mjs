
import test from 'node:test';
import assert from 'node:assert/strict';

const configured = process.env.SUPABASE_FUNCTION_URL?.trim();
const base = configured?.replace(/\/+$/, '');
const opts = { skip: !base && 'Defina SUPABASE_FUNCTION_URL para testar o backend publicado.' };


async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });

  const rawBody = await response.text();

  let json;

  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    throw new Error(
      `Resposta não é JSON!\n` +
      `HTTP: ${response.status}\n` +
      `URL: ${response.url}\n` +
      `Content-Type: ${response.headers.get('content-type')}\n` +
      `Resposta recebida: ${rawBody.slice(0, 500)}`
    );
  }

  return { status: response.status, json };
}


function expectError(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.json));
  assert.equal(typeof result.json.error, 'string');
  assert.ok(result.json.error.length > 0);
}

test('GET /health responde HTTP 200', opts, async () => {
  const result = await request('/health');
  assert.equal(result.status, 200);
  assert.equal(result.json.status, 'ok');
});

test('GET /bootstrap responde com listas de dados', opts, async () => {
  const result = await request('/bootstrap');
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.ok(Array.isArray(result.json.jobs));
  assert.ok(Array.isArray(result.json.applications));
  assert.ok(Array.isArray(result.json.simulations));
});

test('POST /signup rejeita cadastro inválido com HTTP 400', opts, async () => {
  expectError(await request('/signup', 'POST', { name: '', email: 'invalido', password: '123', role: 'worker' }), 400);
});

test('POST /signup exige empresa para empregador', opts, async () => {
  expectError(await request('/signup', 'POST', { name: 'Teste', email: 'teste@example.invalid', password: 'senha12345', role: 'employer', company: '' }), 400);
});

const protectedRoutes = [
  ['POST', '/applications', { jobId: 1, jobTitle: 'Teste', company: 'Teste' }],
  ['DELETE', '/applications/1'],
  ['POST', '/jobs', { title: 'Teste', salary: 2500 }],
  ['DELETE', '/jobs/1'],
  ['PUT', '/jobs/1/extend', {}],
  ['POST', '/simulations', { salary: 2500 }],
  ['PUT', '/profile', { name: 'Teste' }],
];
for (const [method, path, body] of protectedRoutes) {
  test(`${method} ${path} rejeita acesso anônimo com HTTP 401`, opts, async () => {
    expectError(await request(path, method, body), 401);
  });
}
