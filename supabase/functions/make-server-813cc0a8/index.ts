import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { createClient, type User } from "npm:@supabase/supabase-js@2.49.8";

const app = new Hono().basePath("/make-server-813cc0a8");
const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
if (!url || !anonKey || !serviceKey) throw new Error("Configure os secrets do Supabase.");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = Deno.env.get("ALLOWED_ORIGIN") || "*";
app.use("*", cors({ origin, allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], maxAge: 600 }));
app.onError((e, c) => { console.error("Falha de API", e); return c.json({ error: "Erro interno no servidor." }, 500); });
const fail = (c: any, code: number, message: string) => c.json({ error: message }, code);
const fields = "id,name,email,role,company,cpf,phone,city,state,education,area,skills,experience,resume,cnpj,sector,company_size,verification_status,verification_notes";
const jobFields = "id,employer_id,title,company,description,salary,type,area,city,state,deadline,status,benefits,requirements,selection_process,published_at";
type P = { id:string; role:string; name:string; company?:string; verification_status:string };
const str = (v: unknown, limit=200) => typeof v === "string" ? v.trim().slice(0,limit) : "";
const digits = (v: unknown) => str(v,32).replace(/\D/g, "");
const cash = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.round(v*100)/100 : NaN;
const positive = (v: unknown) => Number.isFinite(cash(v)) && cash(v) >= 0;
const uf = (v: unknown) => /^[A-Z]{2}$/.test(str(v).toUpperCase()) ? str(v).toUpperCase() : "";
const isDate = (v:unknown) => /^\d{4}-\d{2}-\d{2}$/.test(str(v)) && !isNaN(Date.parse(str(v)+"T12:00:00Z"));
const today = () => new Date().toISOString().slice(0,10);
function checkCpf(v: unknown) {
  const d=digits(v); if(d.length!==11||/^(\d)\1+$/.test(d)) return false;
  for(let n=9;n<11;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(d[i])*(n+1-i);if(Number(d[n])!==((sum*10)%11)%10)return false;} return true;
}
function checkCnpj(v:unknown) {
  const d=digits(v); if(d.length!==14||/^(\d)\1+$/.test(d))return false;
  for(const [len,w] of [[12,[5,4,3,2,9,8,7,6,5,4,3,2]],[13,[6,5,4,3,2,9,8,7,6,5,4,3,2]]] as const){let sum=0;for(let i=0;i<len;i++)sum+=Number(d[i])*w[i];const r=sum%11;if(Number(d[len])!==(r<2?0:11-r))return false;}return true;
}
async function current(c:any): Promise<User|null> {
  const token=(c.req.header("Authorization")||"").replace(/^Bearer\s+/i,"");
  if (!token || token===anonKey) return null;
  const {data,error}=await db.auth.getUser(token);
  return error ? null : data.user;
}
async function profile(id:string):Promise<any|null>{const {data,error}=await db.from("profiles").select(fields).eq("id",id).maybeSingle();if(error)throw error;return data;}
async function member(c:any, roles:string[]=[]):Promise<{user:User;p:any}|null>{const user=await current(c);if(!user)return null;const p=await profile(user.id);if(!p||roles.length&&!roles.includes(p.role))return null;return {user,p};}
const job = (r:any) => ({id:Number(r.id),employerId:r.employer_id,title:r.title,company:r.company,description:r.description||"",salary:Number(r.salary),type:r.type||"CLT",area:r.area||"Geral",location:[r.city,r.state].filter(Boolean).join(", "),city:r.city||"",state:r.state||"",deadline:r.deadline,status:r.status,benefits:r.benefits||[],requirements:r.requirements||[],process:r.selection_process||"",publishedAt:r.published_at});
const application = (r:any) => ({id:r.id,jobId:Number(r.job_id),jobTitle:r.job_title,company:r.company,status:r.status,appliedAt:r.created_at,workerId:r.user_id,workerName:r.profiles?.name||""});
function parseJob(body:any) {
  const location=str(body?.location,120), parts=location.split(",").map(x=>x.trim());
  const city=str(body?.city||parts[0],100), state=uf(body?.state||parts[1]);
  const deadline=str(body?.deadline,10), title=str(body?.title,140), salary=cash(body?.salary);
  if(title.length<3||!Number.isFinite(salary)||salary<=0||salary>10000000||!city||(!state&&!/remoto/i.test(city))||!isDate(deadline)||deadline<today())return null;
  const arr=(a:any)=>Array.isArray(a)?a.filter((x:any)=>typeof x==="string").slice(0,25).map((s:string)=>str(s,180)).filter(Boolean):[];
  return {title,description:str(body?.description,5000),salary,type:str(body?.type,60)||"CLT",area:str(body?.area,100)||"Geral",city,state:state||null,deadline,benefits:arr(body?.benefits),requirements:arr(body?.requirements),selection_process:str(body?.process,2000),updated_at:new Date().toISOString()};
}
async function insertNotification(userId:string,title:string,message:string){const {error}=await db.from("notifications").insert({user_id:userId,title,message});if(error)console.error(error);}
async function locationId(city:string,state:string|null,scope="city") {
  const query=db.from("locations").select("id").eq("city",city).eq("scope",scope);
  const {data}=state?await query.eq("state",state).maybeSingle():await query.is("state",null).maybeSingle();
  if(data)return data.id;
  const {data:created,error}=await db.from("locations").insert({city,state,scope}).select("id").single();
  if(error)throw error;return created.id;
}
app.get("/health", c=>c.json({status:"ok",version:"2026-11-02"}));

// Signup padrão Supabase: dispara confirmação quando a confirmação por e-mail está habilitada.
app.post("/signup",async c=>{
  const b=await c.req.json().catch(()=>null), name=str(b?.name,140), email=str(b?.email,200).toLowerCase(), password=typeof b?.password==="string"?b.password.slice(0,200):"", role=b?.role;
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||!["worker","employer"].includes(role))return fail(c,400,"Informe nome, e-mail, senha de 8 caracteres e papel válido.");
  const base={name,email,role,phone:str(b.phone,40)||null,city:str(b.city,100)||null,state:uf(b.state)||null};
  let extra:any={};
  if(role==="worker"){
    if(!checkCpf(b.cpf)||!base.phone||!base.city||!base.state)return fail(c,400,"CPF válido, telefone, cidade e estado são obrigatórios.");
    extra={cpf:digits(b.cpf),education:str(b.education,120),area:str(b.area,120),skills:str(b.skills,2000),experience:str(b.experience,4000),resume:str(b.resume,6000),verification_status:"not_required"};
  }else{
    if(!checkCnpj(b.cnpj)||!str(b.company)||!base.phone||!base.city||!base.state||b.cert1!==true||b.cert2!==true||b.cert3!==true)return fail(c,400,"CNPJ válido, dados da empresa e declarações são obrigatórios.");
    extra={company:str(b.company,200),cnpj:digits(b.cnpj),sector:str(b.sector,100),company_size:str(b.size,100),verification_status:"pending"};
  }
  const {data:signup,error:signError}=await auth.auth.signUp({email,password,options:{data:{name,role}}});
  if(signError||!signup.user||!signup.user.identities?.length)return fail(c,400,signError?.message||"E-mail indisponível ou já cadastrado.");
  const {error}=await db.from("profiles").insert({id:signup.user.id,...base,...extra});
  if(error){console.error(error);await db.auth.admin.deleteUser(signup.user.id);return fail(c,400,"Cadastro indisponível. Confira se CPF ou CNPJ já está cadastrado.");}
  return c.json({profileId:signup.user.id,requiresEmailConfirmation:!signup.session,needsEmployerVerification:role==="employer"},201);
});

app.get("/bootstrap",async c=>{
  const user=await current(c), p=user?await profile(user.id):null;
  const [{data:jr,error:je},{data:sr,error:se},{count:activeJobs},{count:workers},{count:employers}]=await Promise.all([
    db.from("jobs").select(jobFields).neq("status","archived").order("published_at",{ascending:false}).limit(500),
    db.from("social_programs").select("id,name,kind,description,requirements,coverage,verified_at,locations(city,state,scope),program_sources(data_sources(name,reference_url,checked_at))").eq("active",true).order("name"),
    db.from("jobs").select("id",{head:true,count:"exact"}).eq("status","active").gte("deadline",today()),
    db.from("profiles").select("id",{head:true,count:"exact"}).eq("role","worker"),
    db.from("profiles").select("id",{head:true,count:"exact"}).eq("role","employer").eq("verification_status","approved")
  ]);
  if(je||se)throw je||se;
  const jobs=(jr||[]).filter((r:any)=>p?.id===r.employer_id || p?.role==="admin" || r.status==="active"&&r.deadline>=today()).map(job);
  const programs=(sr||[]).map((r:any)=>({id:r.id,name:r.name,kind:r.kind,desc:r.description,req:r.requirements,coverage:r.coverage,scope:r.locations?.scope||"national",city:r.locations?.city||"",state:r.locations?.state||"",verifiedAt:r.verified_at,sources:(r.program_sources||[]).map((s:any)=>s.data_sources).filter(Boolean)}));
  const stats={workers:workers||0,employers:employers||0,activeJobs:activeJobs||0};
  if(!p)return c.json({jobs,profile:null,applications:[],simulations:[],notifications:[],employerApplications:[],programs,stats});
  const [a,s,n]=await Promise.all([
    db.from("applications").select("id,job_id,job_title,company,status,created_at,user_id").eq("user_id",p.id).order("created_at",{ascending:false}),
    db.from("simulations").select("id,data,kind,income,total_expenses,final_balance,city,simulation_date,expenses(description,category,amount)").eq("user_id",p.id).order("simulation_date",{ascending:false}).limit(100),
    db.from("notifications").select("id,title,message,read,created_at").eq("user_id",p.id).order("created_at",{ascending:false}).limit(50),
  ]);
  for(const r of [a,s,n])if(r.error)throw r.error;
  let employerApplications:any[]=[];
  if(p.role==="employer"||p.role==="admin"){
    let query=db.from("applications").select("id,job_id,job_title,company,status,created_at,user_id,profiles!applications_user_id_fkey(name),jobs!inner(employer_id)").order("created_at",{ascending:false});
    if(p.role!=="admin") query=query.eq("jobs.employer_id",p.id);
    const {data,error}=await query;if(error)throw error;
    employerApplications=(data||[]).map(application);
  }
  return c.json({jobs,profile:p,applications:(a.data||[]).map(application),simulations:(s.data||[]).map((x:any)=>({id:x.id,...(x.data||{}),date:x.simulation_date,kind:x.kind,salary:Number(x.income),totalExpenses:Number(x.total_expenses),finalBalance:Number(x.final_balance),city:x.city,expenses:x.expenses||[]})),notifications:n.data||[],employerApplications,programs,stats});
});

app.put("/profile",async c=>{
  const m=await member(c);if(!m)return fail(c,401,"Entre na sua conta.");
  const b=await c.req.json().catch(()=>null), name=str(b?.name,140);
  if(name.length<2)return fail(c,400,"Nome inválido.");
  const patch:any={name,phone:str(b.phone,40)||null,city:str(b.city,100)||null,state:uf(b.state)||null,updated_at:new Date().toISOString()};
  if(m.p.role==="worker")Object.assign(patch,{education:str(b.education,120),area:str(b.area,120),skills:str(b.skills,2000),experience:str(b.experience,4000),resume:str(b.resume,6000)});
  if(m.p.role==="employer")Object.assign(patch,{sector:str(b.sector,100),company_size:str(b.company_size,100)});
  const {data,error}=await db.from("profiles").update(patch).eq("id",m.user.id).select(fields).single();if(error)throw error;
  return c.json({profile:data});
});

// Empregadores: documentos privados, aprovação obrigatória por administrador.
app.post("/employer/documents",async c=>{
  const m=await member(c,["employer"]);if(!m)return fail(c,(await current(c))?403:401,"Somente empregadores podem enviar documentos.");
  const b=await c.req.json().catch(()=>null), mime=str(b?.mime,80), filename=str(b?.filename,140);
  if(!["application/pdf","image/png","image/jpeg"].includes(mime)||!filename||typeof b?.base64!=="string")return fail(c,400,"Envie um PDF, PNG ou JPEG válido.");
  const base64=b.base64; if(base64.length>7000000)return fail(c,413,"Arquivo excede 5 MB.");
  let bytes:Uint8Array;
  try{const raw=atob(base64);bytes=Uint8Array.from(raw,x=>x.charCodeAt(0));}catch{return fail(c,400,"Conteúdo inválido.");}
  if(bytes.length===0||bytes.length>5242880)return fail(c,413,"Arquivo vazio ou maior que 5 MB.");
  const pdf=mime==="application/pdf"&&String.fromCharCode(...bytes.slice(0,5))==="%PDF-";
  const png=mime==="image/png"&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const jpg=mime==="image/jpeg"&&bytes[0]===255&&bytes[1]===216;
  if(!pdf&&!png&&!jpg)return fail(c,400,"Assinatura do arquivo incompatível com o tipo informado.");
  const path=`${m.user.id}/${crypto.randomUUID()}.${pdf?"pdf":png?"png":"jpg"}`;
  const {error:up}=await db.storage.from("employer-documents").upload(path,bytes,{contentType:mime,upsert:false});if(up)throw up;
  const {error}=await db.from("employer_documents").insert({employer_id:m.user.id,storage_path:path,original_name:filename,mime_type:mime});if(error){await db.storage.from("employer-documents").remove([path]);throw error;}
  await db.from("profiles").update({verification_status:"pending",verification_notes:null}).eq("id",m.user.id);
  return c.json({success:true,status:"pending"},201);
});
app.get("/admin/employers",async c=>{
  const m=await member(c,["admin"]);if(!m)return fail(c,(await current(c))?403:401,"Acesso administrativo necessário.");
  const {data,error}=await db.from("profiles").select(`${fields},employer_documents(id,original_name,created_at)`).eq("role","employer").order("created_at",{ascending:false});if(error)throw error;
  return c.json({employers:data});
});
app.get("/admin/documents/:id",async c=>{
  const m=await member(c,["admin"]);if(!m)return fail(c,(await current(c))?403:401,"Acesso administrativo necessário.");
  const {data,error}=await db.from("employer_documents").select("storage_path").eq("id",c.req.param("id")).maybeSingle();if(error||!data)return fail(c,404,"Documento não encontrado.");
  const {data:link,error:linkError}=await db.storage.from("employer-documents").createSignedUrl(data.storage_path,120);if(linkError)throw linkError;
  return c.json({url:link.signedUrl});
});
app.put("/admin/employers/:id",async c=>{
  const m=await member(c,["admin"]);if(!m)return fail(c,(await current(c))?403:401,"Acesso administrativo necessário.");
  const b=await c.req.json().catch(()=>null);
  if(!["approved","rejected"].includes(b?.status))return fail(c,400,"Decisão inválida.");
  const id=c.req.param("id");
  const {count}=await db.from("employer_documents").select("id",{head:true,count:"exact"}).eq("employer_id",id);
  if(b.status==="approved"&&!count)return fail(c,400,"O empregador precisa enviar documentos antes de ser aprovado.");
  const {data,error}=await db.from("profiles").update({verification_status:b.status,verification_notes:str(b.notes,1000)||null,verified_at:b.status==="approved"?new Date().toISOString():null}).eq("id",id).eq("role","employer").select("id").maybeSingle();if(error)throw error;if(!data)return fail(c,404,"Empregador não encontrado.");
  await insertNotification(id,"Verificação de empresa",b.status==="approved"?"Sua empresa foi aprovada. Agora você pode publicar vagas.":"Sua documentação precisa de revisão. Verifique a mensagem administrativa.");
  return c.json({success:true});
});

app.post("/jobs",async c=>{
  const m=await member(c,["employer"]);if(!m)return fail(c,(await current(c))?403:401,"Somente empregadores podem publicar vagas.");
  if(m.p.verification_status!=="approved")return fail(c,403,"Envie documentos e aguarde aprovação administrativa para publicar vagas.");
  const b=await c.req.json().catch(()=>null), data=parseJob(b);if(!data)return fail(c,400,"Preencha título, salário positivo, cidade e prazo futuro válido.");
  const region=await locationId(data.city,data.state);
  const {data:row,error}=await db.from("jobs").insert({...data,location_id:region,company:m.p.company||m.p.name,employer_id:m.user.id,data:{},status:"active"}).select(jobFields).single();if(error)throw error;
  return c.json({job:job(row)},201);
});
app.put("/jobs/:id",async c=>{
  const m=await member(c,["employer"]);if(!m)return fail(c,(await current(c))?403:401,"Somente empregadores podem editar vagas.");
  const b=await c.req.json().catch(()=>null), data=parseJob(b);if(!data)return fail(c,400,"Dados ou prazo da vaga inválidos.");
  const {data:row,error}=await db.from("jobs").update({...data,location_id:await locationId(data.city,data.state)}).eq("id",c.req.param("id")).eq("employer_id",m.user.id).neq("status","archived").select(jobFields).maybeSingle();if(error)throw error;if(!row)return fail(c,404,"Vaga não encontrada.");
  const {error:syncError}=await db.from("applications").update({job_title:row.title,company:row.company}).eq("job_id",row.id);if(syncError)throw syncError;
  return c.json({job:job(row)});
});
app.delete("/jobs/:id",async c=>{
  const m=await member(c,["employer","admin"]);if(!m)return fail(c,(await current(c))?403:401,"Acesso negado.");
  let q=db.from("jobs").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",c.req.param("id"));if(m.p.role!=="admin")q=q.eq("employer_id",m.user.id);
  const {data,error}=await q.select("id").maybeSingle();if(error)throw error;if(!data)return fail(c,404,"Vaga não encontrada.");return c.json({success:true});
});
app.put("/jobs/:id/extend",async c=>{
  const m=await member(c,["employer"]);if(!m)return fail(c,(await current(c))?403:401,"Acesso negado.");
  const {data:existing,error}=await db.from("jobs").select(jobFields).eq("id",c.req.param("id")).eq("employer_id",m.user.id).neq("status","archived").maybeSingle();if(error)throw error;if(!existing)return fail(c,404,"Vaga não encontrada.");
  const start=Math.max(Date.parse(existing.deadline+"T12:00:00Z"),Date.now());const deadline=new Date(start+30*86400000).toISOString().slice(0,10);
  const {data:updated,error:ue}=await db.from("jobs").update({deadline,status:"active",updated_at:new Date().toISOString()}).eq("id",existing.id).select(jobFields).single();if(ue)throw ue;return c.json({job:job(updated)});
});
app.post("/applications",async c=>{
  const m=await member(c,["worker"]);if(!m)return fail(c,(await current(c))?403:401,"Somente trabalhadores podem se candidatar.");
  const b=await c.req.json().catch(()=>null), id=Number(b?.jobId);
  if(!Number.isSafeInteger(id)||id<1)return fail(c,400,"ID de vaga inválido.");
  const {data:j,error:je}=await db.from("jobs").select(jobFields).eq("id",id).maybeSingle();if(je)throw je;if(!j||j.status!=="active"||j.deadline<today())return fail(c,404,"Vaga inexistente ou encerrada.");
  const {data,error}=await db.from("applications").insert({user_id:m.user.id,job_id:j.id,job_title:j.title,company:j.company}).select("id,job_id,job_title,company,status,created_at,user_id").single();
  if(error)return fail(c,error.code==="23505"?409:400,error.code==="23505"?"Você já se candidatou.":"Falha ao registrar candidatura.");
  await insertNotification(j.employer_id,"Nova candidatura",`Uma candidatura foi recebida para: ${j.title}.`);
  return c.json({application:application(data)},201);
});
app.delete("/applications/:jobId",async c=>{
  const m=await member(c,["worker"]);if(!m)return fail(c,(await current(c))?403:401,"Acesso negado.");
  const {data,error}=await db.from("applications").delete().eq("user_id",m.user.id).eq("job_id",c.req.param("jobId")).eq("status","Em análise").select("id").maybeSingle();if(error)throw error;if(!data)return fail(c,404,"Candidatura não encontrada ou já processada.");return c.json({success:true});
});
app.put("/applications/:id/status",async c=>{
  const m=await member(c,["employer","admin"]);if(!m)return fail(c,(await current(c))?403:401,"Acesso negado.");
  const b=await c.req.json().catch(()=>null);if(!["Em análise","Entrevista","Reprovado","Aprovado"].includes(b?.status))return fail(c,400,"Status inválido.");
  const {data:a,error:ae}=await db.from("applications").select("id,user_id,job_id,jobs(employer_id,title)").eq("id",c.req.param("id")).maybeSingle();if(ae)throw ae;if(!a)return fail(c,404,"Candidatura inexistente.");
  if(m.p.role!=="admin"&&(a.jobs as any)?.employer_id!==m.user.id)return fail(c,403,"Essa vaga não pertence à sua empresa.");
  const {data:updated,error}=await db.from("applications").update({status:b.status}).eq("id",a.id).select("id,job_id,job_title,company,status,created_at,user_id").single();if(error)throw error;
  await insertNotification(a.user_id,"Atualização de candidatura",`Sua candidatura para ${(a.jobs as any)?.title||"uma vaga"} agora está: ${b.status}.`);
  return c.json({application:application(updated)});
});

app.post("/simulations",async c=>{
  const m=await member(c);if(!m)return fail(c,401,"Entre na sua conta para salvar a simulação.");
  const b=await c.req.json().catch(()=>null), salary=cash(b?.salary), net=cash(b?.netSalary), kind=b?.kind==="life"?"life":"salary";
  if(!positive(salary)||!positive(net)||salary>10000000)return fail(c,400,"Renda ou salário inválido.");
  const expenses=Array.isArray(b?.expenses)?b.expenses.slice(0,100).map((x:any)=>({description:str(x.description,200),category:str(x.category,80),amount:cash(x.amount)})):[];
  if(expenses.some((x:any)=>!x.description||!x.category||!positive(x.amount)))return fail(c,400,"Despesa inválida.");
  const total=expenses.reduce((s:number,x:any)=>s+x.amount,0), final=typeof b?.finalBalance==="number"?cash(b.finalBalance):Math.round((net-total)*100)/100;
  if(!Number.isFinite(final)||Math.abs(final)>10000000)return fail(c,400,"Saldo inválido.");
  const item={kind,salary,netSalary:net,inss:positive(b?.inss)?cash(b.inss):0,irrf:positive(b?.irrf)?cash(b.irrf):0,fgts:positive(b?.fgts)?cash(b.fgts):0,city:str(b?.city,100),date:new Date().toISOString(),totalExpenses:Math.round(total*100)/100,finalBalance:final,expenses};
  const {data:created,error}=await db.from("simulations").insert({user_id:m.user.id,kind,income:salary,total_expenses:item.totalExpenses,final_balance:final,city:item.city,simulation_date:item.date,data:item}).select("id").single();if(error)throw error;
  if(expenses.length){const {error:ee}=await db.from("expenses").insert(expenses.map((x:any)=>({...x,simulation_id:created.id})));if(ee){await db.from("simulations").delete().eq("id",created.id);throw ee;}}
  const {data:sources}=await db.from("data_sources").select("id").in("name",["Previdência Social - INSS","Receita Federal - IRPF 2026"]);
  if(sources?.length)await db.from("simulation_sources").insert(sources.map((x:any)=>({simulation_id:created.id,source_id:x.id})));
  return c.json({simulation:{id:created.id,...item}},201);
});
app.put("/notifications/:id/read",async c=>{
  const m=await member(c);if(!m)return fail(c,401,"Entre na sua conta.");
  const {data,error}=await db.from("notifications").update({read:true}).eq("id",c.req.param("id")).eq("user_id",m.user.id).select("id").maybeSingle();if(error)throw error;if(!data)return fail(c,404,"Notificação não encontrada.");return c.json({success:true});
});
Deno.serve(app.fetch);
