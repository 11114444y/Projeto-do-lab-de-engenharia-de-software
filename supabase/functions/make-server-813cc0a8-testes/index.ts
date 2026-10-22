import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { createClient, type User } from "npm:@supabase/supabase-js@2.49.8";

const app = new Hono().basePath("/make-server-813cc0a8-testes");const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Faltam SUPABASE_URL, SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY nos secrets da função.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 600,
}));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Erro interno no servidor." }, 500);
});

const fail = (c: any, status: number, error: string) => c.json({ error }, status);
const profileFields = "id, name, email, role, company";

type Profile = { id: string; name: string; email: string; role: "worker" | "employer"; company: string | null };
type JobData = { title: string; company: string; location: string; salary: number; type: string; area: string; deadline: string; benefits: string[]; description: string; requirements: string[]; process: string };

async function optionalUser(c: any): Promise<User | null> {
  const authorization = c.req.header("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === anonKey) return null;
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  return error ? null : data.user;
}

async function requireUser(c: any): Promise<User | null> {
  const user = await optionalUser(c);
  return user;
}

async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await admin.from("profiles").select(profileFields).eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

function serializeJob(row: { id: number; employer_id: string; data: JobData }) {
  return { ...row.data, id: Number(row.id), employerId: row.employer_id };
}

app.get("/health", (c) => c.json({ status: "ok" }));

// Cadastro de teste. A confirmação de e-mail é marcada como concluída para permitir
// testar o fluxo local imediatamente; altere para false antes de usar em produção.
app.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const role = body?.role;
  const company = role === "employer" ? String(body?.company ?? "").trim() : null;

  if (!name || !email || password.length < 8 || !["worker", "employer"].includes(role)) {
    return fail(c, 400, "Informe nome, e-mail, senha com pelo menos 8 caracteres e tipo de conta válido.");
  }
  if (role === "employer" && !company) return fail(c, 400, "Informe o nome da empresa.");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, company },
  });
  if (createError || !created.user) {
    const message = createError?.message ?? "Não foi possível criar a conta.";
    return fail(c, 400, /already|registered|exists/i.test(message) ? "Este e-mail já está cadastrado." : message);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id, name, email, role, company,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    console.error(profileError);
    return fail(c, 500, "A conta foi iniciada, mas não foi possível criar o perfil. Tente novamente.");
  }

  return c.json({ profile: { id: created.user.id, name, email, role, company } }, 201);
});

app.get("/bootstrap", async (c) => {
  const { data: jobRows, error: jobsError } = await admin.from("jobs")
    .select("id, employer_id, data").order("created_at", { ascending: false });
  if (jobsError) throw jobsError;

  const user = await optionalUser(c);
  if (!user) return c.json({ jobs: (jobRows ?? []).map(serializeJob), profile: null, applications: [], simulations: [] });

  const profile = await getProfile(user.id);
  if (!profile) return c.json({ jobs: (jobRows ?? []).map(serializeJob), profile: null, applications: [], simulations: [] });

  const [{ data: applicationRows, error: applicationsError }, { data: simulationRows, error: simulationsError }] = await Promise.all([
    admin.from("applications").select("job_id, job_title, company, status, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("simulations").select("data, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (applicationsError) throw applicationsError;
  if (simulationsError) throw simulationsError;

  const applications = (applicationRows ?? []).map((row) => ({
    jobId: Number(row.job_id), jobTitle: row.job_title, company: row.company,
    status: row.status, appliedAt: row.created_at,
  }));
  const simulations = (simulationRows ?? []).map((row) => row.data);
  return c.json({ jobs: (jobRows ?? []).map(serializeJob), profile, applications, simulations });
});

app.post("/applications", async (c) => {
  const user = await requireUser(c);
  if (!user) return fail(c, 401, "Entre na sua conta para se candidatar.");
  const profile = await getProfile(user.id);
  if (!profile || profile.role !== "worker") return fail(c, 403, "Somente trabalhadores podem se candidatar a vagas.");
  const body = await c.req.json().catch(() => null);
  const jobId = Number(body?.jobId);
  const jobTitle = String(body?.jobTitle ?? "").trim();
  const company = String(body?.company ?? "").trim();
  if (!Number.isSafeInteger(jobId) || jobId <= 0 || !jobTitle || !company) return fail(c, 400, "Dados da vaga inválidos.");

  const { data, error } = await admin.from("applications").insert({
    user_id: user.id, job_id: jobId, job_title: jobTitle, company,
  }).select("job_id, job_title, company, status, created_at").single();
  if (error) return fail(c, error.code === "23505" ? 409 : 400, error.code === "23505" ? "Você já se candidatou a esta vaga." : "Não foi possível salvar a candidatura.");
  return c.json({ application: { jobId: Number(data.job_id), jobTitle: data.job_title, company: data.company, status: data.status, appliedAt: data.created_at } }, 201);
});

app.delete("/applications/:jobId", async (c) => {
  const user = await requireUser(c);
  if (!user) return fail(c, 401, "Entre na sua conta para gerenciar candidaturas.");
  const jobId = Number(c.req.param("jobId"));
  const { error, count } = await admin.from("applications").delete({ count: "exact" })
    .eq("user_id", user.id).eq("job_id", jobId);
  if (error) throw error;
  if (!count) return fail(c, 404, "Candidatura não encontrada.");
  return c.json({ success: true });
});

app.post("/jobs", async (c) => {
  const user = await requireUser(c);
  if (!user) return fail(c, 401, "Entre na sua conta para publicar vagas.");
  const profile = await getProfile(user.id);
  if (!profile || profile.role !== "employer") return fail(c, 403, "Somente empregadores podem publicar vagas.");
  const body = await c.req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  const salary = Number(body?.salary);
  if (!title || !Number.isFinite(salary) || salary <= 0) return fail(c, 400, "Informe o título e um salário válido.");

  const job: JobData = {
    title,
    company: profile.company || profile.name,
    location: String(body?.location ?? "Não informado"),
    salary,
    type: String(body?.type ?? "CLT"),
    area: String(body?.area ?? "Geral"),
    deadline: String(body?.deadline ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
    benefits: Array.isArray(body?.benefits) ? body.benefits.map(String) : [],
    description: String(body?.description ?? ""),
    requirements: Array.isArray(body?.requirements) ? body.requirements.map(String) : [],
    process: String(body?.process ?? ""),
  };
  const { data, error } = await admin.from("jobs").insert({ employer_id: user.id, data: job })
    .select("id, employer_id, data").single();
  if (error) throw error;
  return c.json({ job: serializeJob(data) }, 201);
});

app.delete("/jobs/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return fail(c, 401, "Entre na sua conta para gerenciar vagas.");
  const id = Number(c.req.param("id"));
  const { data, error } = await admin.from("jobs").delete().eq("id", id).eq("employer_id", user.id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(c, 404, "Vaga não encontrada ou você não tem permissão para excluí-la.");
  return c.json({ success: true });
});

app.put("/jobs/:id/extend", async (c) => {
  const user = await requireUser(c);
  if (!user) return fail(c, 401, "Entre na sua conta para gerenciar vagas.");
  const id = Number(c.req.param("id"));
  const { data: row, error: readError } = await admin.from("jobs").select("id, employer_id, data").eq("id", id).eq("employer_id", user.id).maybeSingle();
  if (readError) throw readError;
  if (!row) return fail(c, 404, "Vaga não encontrada ou você não tem permissão para alterá-la.");
  const currentDeadline = new Date(`${row.data.deadline || new Date().toISOString().slice(0, 10)}T12:00:00`);
  const base = Math.max(currentDeadline.getTime(), Date.now());
  const nextDeadline = new Date(base + 30 * 86400000).toISOString().slice(0, 10);
  const nextData = { ...row.data, deadline: nextDeadline };
  const { data, error } = await admin.from("jobs").update({ data: nextData, updated_at: new Date().toISOString() })
    .eq("id", id).eq("employer_id", user.id).select("id, employer_id, data").single();
  if (error) throw error;
  return c.json({ job: serializeJob(data) });
});

app.post("/simulations", async (c) => {
  const user = await requireUser(c);
  if (!user) return fail(c, 401, "Entre na sua conta para salvar simulações.");
  const body = await c.req.json().catch(() => null);
  if (!body || !Number.isFinite(Number(body.salary))) return fail(c, 400, "Dados da simulação inválidos.");
  const simulation = {
    date: String(body.date ?? new Date().toISOString()),
    salary: Number(body.salary), netSalary: Number(body.netSalary ?? 0),
    inss: Number(body.inss ?? 0), irrf: Number(body.irrf ?? 0), fgts: Number(body.fgts ?? 0),
  };
  const { error } = await admin.from("simulations").insert({ user_id: user.id, data: simulation });
  if (error) throw error;
  return c.json({ simulation }, 201);
});

app.put("/profile", async (c) => {
  const user = await requireUser(c);
  if (!user) return fail(c, 401, "Entre na sua conta para alterar o perfil.");
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (name.length < 2) return fail(c, 400, "Informe um nome com pelo menos 2 caracteres.");
  const { data, error } = await admin.from("profiles").update({ name, updated_at: new Date().toISOString() })
    .eq("id", user.id).select(profileFields).single();
  if (error) throw error;
  return c.json({ profile: data });
});

Deno.serve(app.fetch);
