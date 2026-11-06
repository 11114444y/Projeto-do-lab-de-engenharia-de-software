-- Evolução aditiva sobre 20261021000100_initial_schema.sql.
-- Atenção: executar em staging e revisar dados históricos antes de produção.
create extension if not exists pgcrypto;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('worker','employer','admin'));
alter table public.profiles
  add column if not exists cpf text,
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists state char(2),
  add column if not exists education text,
  add column if not exists area text,
  add column if not exists skills text,
  add column if not exists experience text,
  add column if not exists resume text,
  add column if not exists cnpj text,
  add column if not exists sector text,
  add column if not exists company_size text,
  add column if not exists verification_status text not null default 'not_required',
  add column if not exists verification_notes text,
  add column if not exists verified_at timestamptz;
alter table public.profiles add constraint profiles_verification_status_check check (verification_status in ('not_required','pending','approved','rejected'));
create unique index if not exists profiles_cpf_unique on public.profiles(cpf) where cpf is not null;
create unique index if not exists profiles_cnpj_unique on public.profiles(cnpj) where cnpj is not null;

create table if not exists public.locations (
  id bigint generated always as identity primary key,
  city text not null,
  state char(2),
  country char(2) not null default 'BR',
  scope text not null default 'city' check (scope in ('national','state','city')),
  created_at timestamptz not null default now()
);
create unique index if not exists locations_key_unique on public.locations(lower(city),coalesce(state,''),country,scope);

alter table public.jobs
  add column if not exists title text,
  add column if not exists company text,
  add column if not exists description text,
  add column if not exists salary numeric(12,2),
  add column if not exists type text,
  add column if not exists area text,
  add column if not exists city text,
  add column if not exists state char(2),
  add column if not exists location_id bigint references public.locations(id),
  add column if not exists deadline date,
  add column if not exists status text not null default 'active',
  add column if not exists benefits text[] not null default '{}',
  add column if not exists requirements text[] not null default '{}',
  add column if not exists selection_process text,
  add column if not exists published_at timestamptz not null default now();
-- Migração dos dados legados em JSONB; mantém data para compatibilidade histórica.
update public.jobs set published_at = created_at where published_at > created_at;
update public.jobs set
  title = coalesce(nullif(data->>'title',''), 'Vaga sem título'),
  company = coalesce(nullif(data->>'company',''), 'Empresa não informada'),
  description = coalesce(data->>'description',''),
  salary = case when (data->>'salary') ~ '^\d+(\.\d+)?$' then (data->>'salary')::numeric else 0 end,
  type = coalesce(data->>'type','CLT'),
  area = coalesce(data->>'area','Geral'),
  city = trim(split_part(coalesce(data->>'location',''),',',1)),
  state = case when trim(split_part(coalesce(data->>'location',''),',',2)) ~ '^[A-Z]{2}$' then trim(split_part(data->>'location',',',2))::char(2) else null end,
  deadline = case when (data->>'deadline') ~ '^\d{4}-\d{2}-\d{2}$' then (data->>'deadline')::date else current_date end,
  benefits = case when jsonb_typeof(data->'benefits') = 'array' then array(select jsonb_array_elements_text(data->'benefits')) else '{}'::text[] end,
  requirements = case when jsonb_typeof(data->'requirements') = 'array' then array(select jsonb_array_elements_text(data->'requirements')) else '{}'::text[] end,
  selection_process = coalesce(data->>'process',''),
  status = case when (data->>'deadline') ~ '^\d{4}-\d{2}-\d{2}$' and (data->>'deadline')::date < current_date then 'closed' else 'active' end
where title is null;

-- Vagas novas devem ser normalizadas; impede registros sem valor válido.
alter table public.jobs alter column title set not null;
alter table public.jobs alter column company set not null;
alter table public.jobs alter column salary set not null;
alter table public.jobs alter column deadline set not null;
alter table public.jobs add constraint jobs_salary_positive check (salary > 0) not valid;
alter table public.jobs add constraint jobs_status_check check (status in ('active','closed','archived'));
create index if not exists jobs_region_status_idx on public.jobs(state,city,status,deadline);

-- Vincular as vagas migradas a localidades persistidas.
insert into public.locations(city,state,scope)
select distinct coalesce(nullif(city,''),'Não informado'),state,'city'
from public.jobs
on conflict do nothing;
update public.jobs j set location_id=l.id
from public.locations l
where l.city=coalesce(nullif(j.city,''),'Não informado') and l.state is not distinct from j.state and l.scope='city' and j.location_id is null;

-- Preservar candidaturas órfãs legadas para auditoria antes da restrição.
create table if not exists public.legacy_orphan_applications (like public.applications including defaults);
insert into public.legacy_orphan_applications select a.* from public.applications a left join public.jobs j on j.id=a.job_id where j.id is null;
delete from public.applications a where not exists (select 1 from public.jobs j where j.id=a.job_id);
alter table public.applications add constraint applications_job_id_fkey foreign key (job_id) references public.jobs(id) on delete restrict;
create index if not exists applications_job_idx on public.applications(job_id,created_at desc);

alter table public.simulations
 add column if not exists kind text not null default 'salary',
 add column if not exists income numeric(12,2),
 add column if not exists total_expenses numeric(12,2) not null default 0,
 add column if not exists final_balance numeric(12,2),
 add column if not exists city text,
 add column if not exists simulation_date timestamptz not null default now();
alter table public.simulations add constraint simulations_kind_check check (kind in ('salary','life'));
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(),
 simulation_id uuid not null references public.simulations(id) on delete cascade,
 description text not null,
 category text not null,
 amount numeric(12,2) not null check(amount >= 0)
);
create index if not exists expenses_simulation_idx on public.expenses(simulation_id);

create table if not exists public.data_sources (
 id bigint generated always as identity primary key,
 name text not null unique,
 reference_url text not null,
 description text,
 checked_at date not null default current_date
);
create table if not exists public.social_programs (
 id bigint generated always as identity primary key,
 name text not null unique,
 kind text not null check(kind in ('benefit','service')),
 description text not null,
 requirements text not null,
 coverage text not null,
 location_id bigint references public.locations(id),
 active boolean not null default true,
 verified_at date not null default current_date
);
create table if not exists public.program_sources (
 program_id bigint not null references public.social_programs(id) on delete cascade,
 source_id bigint not null references public.data_sources(id) on delete cascade,
 primary key(program_id,source_id)
);
create table if not exists public.simulation_sources (
 simulation_id uuid not null references public.simulations(id) on delete cascade,
 source_id bigint not null references public.data_sources(id),
 primary key(simulation_id,source_id)
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null,
 message text not null,
 read boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx on public.notifications(user_id,read,created_at desc);
create table if not exists public.employer_documents (
 id uuid primary key default gen_random_uuid(),
 employer_id uuid not null references public.profiles(id) on delete cascade,
 storage_path text not null unique,
 original_name text not null,
 mime_type text not null,
 created_at timestamptz not null default now()
);

-- Bucket privado: somente API com service role gera uploads e links temporários para revisão.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('employer-documents','employer-documents',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

-- Catálogo inicial: somente fontes oficiais, serviços de alcance nacional.
insert into public.locations(city,state,country,scope) values ('Brasil',null,'BR','national') on conflict do nothing;
insert into public.data_sources(name,reference_url,description,checked_at) values
 ('Cadastro Único - MDS','https://www.gov.br/mds/pt-br/acoes-e-programas/cadastro-unico/Cadastro-unico/','Informações oficiais sobre programas sociais e atendimento do CadÚnico','2026-11-02'),
 ('Previdência Social - INSS','https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal','Tabela contributiva INSS, competência 2026','2026-11-02'),
 ('Receita Federal - IRPF 2026','https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026','Tabela mensal de IRPF e reduções de 2026','2026-11-02')
on conflict (name) do update set reference_url=excluded.reference_url,description=excluded.description,checked_at=excluded.checked_at;
insert into public.social_programs(name,kind,description,requirements,coverage,location_id) values
 ('Cadastro Único','service','Cadastro de famílias para acesso a programas sociais. Procure posto de cadastramento ou CRAS do município.','Consulte os documentos e critérios do cadastro no portal oficial; atendimento presencial.','Nacional',(select id from public.locations where scope='national' limit 1)),
 ('Bolsa Família','benefit','Transferência de renda a famílias elegíveis, com regras e valores vigentes definidos pelo MDS.','Exige avaliação de renda familiar, CadÚnico e demais condições do programa. Não há concessão automática.','Nacional',(select id from public.locations where scope='national' limit 1)),
 ('Benefício de Prestação Continuada (BPC)','benefit','Benefício assistencial para idosos e pessoas com deficiência que atendam aos critérios legais.','Requisitos legais de idade ou deficiência, renda e cadastro. Confirme no INSS/CadÚnico.','Nacional',(select id from public.locations where scope='national' limit 1)),
 ('Tarifa Social de Energia Elétrica','benefit','Desconto na tarifa de energia para famílias elegíveis.','Consulte regras atualizadas e elegibilidade com a distribuidora e CadÚnico.','Nacional',(select id from public.locations where scope='national' limit 1)),
 ('CRAS / Assistência social municipal','service','Centro de Referência de Assistência Social; oferece orientação e encaminhamento no município.','Procure o CRAS do município para verificar atendimento e documentação.','Nacional — encontre sua unidade municipal',(select id from public.locations where scope='national' limit 1))
on conflict (name) do update set description=excluded.description,requirements=excluded.requirements,coverage=excluded.coverage,location_id=excluded.location_id;
insert into public.program_sources(program_id,source_id)
select p.id,s.id from public.social_programs p cross join public.data_sources s where s.name='Cadastro Único - MDS'
on conflict do nothing;

-- Serviços públicos regionais verificados, com link para informações e unidades oficiais.
insert into public.locations(city,state,scope) values ('São Paulo','SP','city') on conflict do nothing;
insert into public.data_sources(name,reference_url,description,checked_at) values
 ('Prefeitura de São Paulo - CRAS','https://www2.prefeitura.sp.gov.br/web/assistencia_social/w/protecao_social_basica/1906','Relação municipal de CRAS, unidades e atendimento','2026-11-02'),
 ('Ministério do Trabalho - SINE','https://www.gov.br/pt-br/servicos/buscar-emprego-no-sistema-nacional-de-emprego-sine','Orientações oficiais para localizar atendimento de emprego','2026-11-02')
on conflict (name) do update set reference_url=excluded.reference_url,description=excluded.description,checked_at=excluded.checked_at;
insert into public.social_programs(name,kind,description,requirements,coverage,location_id) values
 ('CRAS - São Paulo (SP)','service','Orientação presencial nos Centros de Referência de Assistência Social da capital de São Paulo. Consulte o mapa de unidades da Prefeitura.','Atendimento municipal. Verifique endereço e horários no portal oficial.','Cidade de São Paulo (SP)',(select id from public.locations where city='São Paulo' and state='SP' and scope='city' limit 1)),
 ('SINE / Portal Emprega Brasil','service','Serviço público de intermediação de emprego, presencial na rede SINE ou pela plataforma digital.','Cadastre dados e consulte o portal oficial para localizar postos e vagas.','Nacional',(select id from public.locations where scope='national' limit 1))
on conflict (name) do update set description=excluded.description,requirements=excluded.requirements,coverage=excluded.coverage,location_id=excluded.location_id;
insert into public.program_sources(program_id,source_id)
select p.id,s.id from public.social_programs p join public.data_sources s on
  (p.name='CRAS - São Paulo (SP)' and s.name='Prefeitura de São Paulo - CRAS') or
  (p.name='SINE / Portal Emprega Brasil' and s.name='Ministério do Trabalho - SINE')
on conflict do nothing;

-- Organizações sem fins lucrativos: cadastro com referências publicadas pelas próprias organizações.
-- O programa PROA é regional: a mesma iniciativa é vinculada separadamente a cada estado atendido.
insert into public.locations(city,state,scope)
select 'Todo o estado',uf,'state' from (values ('SP'),('RJ'),('SC'),('PR'),('RS'),('MG'),('MS'),('GO'),('DF'),('BA'),('PE'),('PA')) as r(uf)
on conflict do nothing;
insert into public.data_sources(name,reference_url,description,checked_at) values
 ('Instituto PROA — Plataforma','https://www.proa.org.br/plataformaproa/','Regras oficiais de participação e abrangência dos cursos gratuitos do Instituto PROA','2026-11-02'),
 ('Gerando Falcões — Decolagem','https://www.gerandofalcoes.com/decolagem','Apresentação oficial do programa social Decolagem e seu acompanhamento territorial','2026-11-02')
on conflict (name) do update set reference_url=excluded.reference_url,description=excluded.description,checked_at=excluded.checked_at;
insert into public.social_programs(name,kind,description,requirements,coverage,location_id)
select 'Instituto PROA - Plataforma ('||r.uf||')','service',
  'Formação gratuita online com foco em preparação para o primeiro emprego e desenvolvimento de habilidades profissionais.',
  'Requisitos divulgados pela organização: idade entre 17 e 22 anos, cursando ou tendo concluído o 3º ano do ensino médio em escola pública e residência em estado atendido. Inscrições e vagas devem ser verificadas no portal.',
  'Estado: '||r.uf,
  (select id from public.locations l where l.state=r.uf and l.scope='state' limit 1)
from (values ('SP'),('RJ'),('SC'),('PR'),('RS'),('MG'),('MS'),('GO'),('DF'),('BA'),('PE'),('PA')) as r(uf)
on conflict (name) do update set description=excluded.description,requirements=excluded.requirements,coverage=excluded.coverage,location_id=excluded.location_id;
insert into public.social_programs(name,kind,description,requirements,coverage,location_id) values
 ('Gerando Falcões - Decolagem','service',
 'Iniciativa de acompanhamento de famílias em territórios atendidos pela organização, com foco na saída da pobreza e na geração de renda.',
 'Participação depende da abrangência territorial e da seleção feita pela organização; consulte o site para obter informações. Não há atendimento universal garantido.',
 'Programa territorial em comunidades participantes; consulte a organização antes de buscar atendimento.',
 (select id from public.locations where scope='national' limit 1))
on conflict (name) do update set description=excluded.description,requirements=excluded.requirements,coverage=excluded.coverage,location_id=excluded.location_id;
insert into public.program_sources(program_id,source_id)
select p.id,s.id from public.social_programs p join public.data_sources s on
 (p.name like 'Instituto PROA - Plataforma (%' and s.name='Instituto PROA — Plataforma') or
 (p.name='Gerando Falcões - Decolagem' and s.name='Gerando Falcões — Decolagem')
on conflict do nothing;

-- Tabelas administrativas e sensíveis nunca têm políticas abertas. Só a função realiza controle de acesso.
do $$ declare t text; begin
 foreach t in array array['locations','expenses','data_sources','social_programs','program_sources','simulation_sources','notifications','employer_documents','legacy_orphan_applications'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
