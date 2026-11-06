import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261102000100_complete_domain.sql');
const backend=read('supabase/functions/make-server-813cc0a8/index.ts');
const frontend=read('src/App.tsx');
const game=read('src/SimGame.tsx');
test('migração cobre domínio e integridade',()=>{
  for(const table of ['locations','expenses','data_sources','social_programs','program_sources','simulation_sources','notifications','employer_documents'])
    assert.match(migration,new RegExp(`create table if not exists public\\.${table}\\b`,'i'));
  assert.match(migration,/foreign key \(job_id\) references public\.jobs\(id\)/i);
  assert.match(migration,/legacy_orphan_applications/);
  assert.match(migration,/jobs_salary_positive/);
  assert.match(migration,/storage\.buckets/);
});
test('backend valida cadastro, candidato, prazo, aprovação e propriedade da vaga',()=>{
  for(const expected of ['checkCpf','checkCnpj','verification_status','employer_documents','jobs','status','notifications','/admin/employers','/applications/:id/status','/jobs/:id'])
    assert.ok(backend.includes(expected),`ausente ${expected}`);
  assert.match(backend,/\.eq\("employer_id",m\.user\.id\)/);
  assert.match(backend,/job_id:j\.id,job_title:j\.title,company:j\.company/);
  assert.doesNotMatch(backend,/job_title:\s*body\?\.jobTitle/);
});
test('frontend não mistura vagas falsas e oferece gestão',()=>{
  assert.doesNotMatch(frontend,/INITIAL_JOBS|INITIAL_SIM_HISTORY|TransBrasil Logística|value: "48\.230"/);
  for(const expected of ['EmployerVerification','EmployerApplicantPanel','AdminPanel','NotificationsPanel','onEdit','setStateFilter','setMinSalary'])
    assert.ok(frontend.includes(expected),`ausente ${expected}`);
  assert.match(game,/onComplete/);
  assert.match(game,/spentByCategory/);
});
test('documentação e segredos isolados',()=>{
  assert.ok(existsSync(new URL('../docs/IMPLEMENTACAO_FINAL.md',import.meta.url)));
  assert.doesNotMatch(frontend,/SUPABASE_SERVICE_ROLE_KEY/);
});
