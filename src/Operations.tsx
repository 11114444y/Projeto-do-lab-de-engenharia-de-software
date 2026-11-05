import { useEffect, useState } from "react";
import { api } from "./lib/api";

type Application = {id?:string;jobId:number;jobTitle:string;company:string;status:string;workerName?:string;appliedAt:string};
export function EmployerApplicantPanel({applications,onStatus}:{applications:Application[];onStatus:(id:string,status:string)=>Promise<void>}){
  const [busy,setBusy]=useState("");
  return <section className="max-w-4xl mx-auto p-6 space-y-5"><h1 className="text-3xl font-semibold">Candidaturas recebidas</h1>
  {!applications.length&&<p className="bg-card border border-border p-6">Nenhuma candidatura recebida nas suas vagas.</p>}
  {applications.map(a=><article key={a.id} className="bg-card border border-border p-5 space-y-2">
    <p className="font-semibold">{a.jobTitle} — {a.workerName||"Trabalhador"}</p>
    <p className="text-xs text-muted-foreground">{new Date(a.appliedAt).toLocaleString("pt-BR")}</p>
    <label className="text-sm flex items-center gap-2">Status
      <select aria-label={`Status de ${a.workerName||"candidatura"}`} disabled={busy===a.id} className="border border-border p-2 bg-background" value={a.status} onChange={async e=>{if(!a.id)return;setBusy(a.id);try{await onStatus(a.id,e.target.value);}catch(err){alert(err instanceof Error?err.message:"Falha na alteração");}finally{setBusy("");}}}>
        {["Em análise","Entrevista","Aprovado","Reprovado"].map(s=><option key={s}>{s}</option>)}
      </select>
    </label>
  </article>)}
  </section>;
}

export function EmployerVerification({status,notes,onUploaded}:{status?:string;notes?:string;onUploaded:()=>Promise<void>}){
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false);
  const submit=async()=>{
    if(!file)return; if(file.size>5*1024*1024){alert("Limite de 5 MB por documento.");return;}
    setBusy(true);
    try{const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(new Error("Arquivo ilegível"));reader.readAsDataURL(file);});
      await api("/employer/documents",{method:"POST",body:JSON.stringify({filename:file.name,mime:file.type,base64})});
      setFile(null);alert("Comprovante enviado para revisão. A aprovação não é automática.");await onUploaded();
    }catch(e){alert(e instanceof Error?e.message:"Falha no envio");}finally{setBusy(false);}
  };
  return <section className="border border-border p-5 bg-card space-y-3" aria-label="Verificação de empresa">
    <h2 className="font-semibold text-lg">Verificação documental do empregador</h2>
    <p className="text-sm">Status: <strong>{status==="approved"?"Aprovado":status==="rejected"?"Rejeitado": "Pendente de avaliação"}</strong></p>
    {notes&&<p className="text-xs">Observações: {notes}</p>}
    <p className="text-sm text-muted-foreground">Envie PDF ou imagem de documento da empresa (por exemplo, comprovante de inscrição e situação cadastral e comprovante de vínculo do responsável). A equipe administradora conferirá antes de liberar publicação. Não envie documentos pessoais desnecessários.</p>
    <input aria-label="Documento comprobatório da empresa" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={e=>setFile(e.target.files?.[0]||null)} />
    <button disabled={!file||busy} onClick={submit} className="bg-primary text-primary-foreground p-2 disabled:opacity-50">{busy?"Enviando...":"Enviar documento"}</button>
  </section>;
}

type Employer = {id:string;name:string;company?:string;email:string;cnpj?:string;verification_status:string;verification_notes?:string;employer_documents:{id:string;original_name:string;created_at:string}[]};
export function AdminPanel({refresh,jobs,onArchive}:{refresh:()=>Promise<unknown>;jobs:{id:number;title:string;company:string;status?:string}[];onArchive:(id:number)=>Promise<void>}){
  const [employers,setEmployers]=useState<Employer[]>([]),[error,setError]=useState("");
  const load=async()=>{try{const r=await api<{employers:Employer[]}>("/admin/employers");setEmployers(r.employers);setError("");}catch(e){setError(e instanceof Error?e.message:"Erro");}};
  useEffect(()=>{void load();},[]);
  const decide=async(id:string,status:string)=>{const notes=prompt("Observação da revisão (opcional):")||"";try{await api(`/admin/employers/${id}`,{method:"PUT",body:JSON.stringify({status,notes})});await load();await refresh();}catch(e){alert(e instanceof Error?e.message:"Não foi possível atualizar");}};
  const openDoc=async(id:string)=>{try{const {url}=await api<{url:string}>(`/admin/documents/${id}`);window.open(url,"_blank","noopener,noreferrer");}catch(e){alert(e instanceof Error?e.message:"Documento indisponível");}};
  return <section className="max-w-5xl mx-auto p-6 space-y-4"><h1 className="text-3xl font-semibold">Painel administrativo</h1>
    <p className="text-sm text-muted-foreground">Compare CNPJ e comprovantes com fontes oficiais antes de aprovar. A plataforma não realiza verificação automática na Receita Federal.</p>
    <button onClick={()=>void load()} className="border border-border px-3 py-2">Atualizar avaliações</button>{error&&<p role="alert">{error}</p>}
    {employers.map(p=><article key={p.id} className="bg-card border border-border p-5 space-y-2">
      <h2 className="font-semibold">{p.company} — {p.name}</h2>
      <p className="text-xs">CNPJ: {p.cnpj} · {p.email} · <strong>{p.verification_status}</strong></p>
      <div className="flex flex-wrap gap-2">{p.employer_documents.map(d=><button className="underline text-primary text-sm" key={d.id} onClick={()=>void openDoc(d.id)}>{d.original_name} ↗</button>)}</div>
      <div className="flex gap-2"><button onClick={()=>void decide(p.id,"approved")} className="bg-primary text-primary-foreground px-3 py-2 text-sm">Aprovar</button><button onClick={()=>void decide(p.id,"rejected")} className="border border-red-300 px-3 py-2 text-sm">Rejeitar</button></div>
    </article>)}
    <h2 className="text-xl font-semibold pt-5">Moderação de vagas</h2>
    {jobs.filter(j=>j.status!=="archived").map(j=><div key={j.id} className="flex justify-between items-center border border-border p-3 gap-3"><span className="text-sm">#{j.id} · {j.title} — {j.company} ({j.status})</span>
      <button className="text-red-700 text-xs border border-red-200 p-2" onClick={async()=>{if(confirm("Arquivar esta vaga e impedir novas candidaturas?"))await onArchive(j.id);}}>Arquivar</button></div>)}
  </section>;
}
export function NotificationsPanel({items,onRead}:{items:{id:string;title:string;message:string;read:boolean;created_at:string}[];onRead:(id:string)=>Promise<void>}){
  return <section className="max-w-3xl mx-auto p-6 space-y-4"><h1 className="text-3xl font-semibold">Notificações</h1>
    {!items.length&&<p className="border border-border p-6">Você não tem notificações.</p>}
    {items.map(n=><article key={n.id} className={`border border-border p-4 ${n.read?"opacity-70":"bg-card"}`}>
      <p className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</p><p className="font-semibold">{n.title}</p><p className="text-sm mb-2">{n.message}</p>
      {!n.read&&<button onClick={()=>void onRead(n.id)} className="text-sm underline text-primary">Marcar como lida</button>}
    </article>)}
  </section>;
}
