import { useState, useCallback, useEffect } from "react";
import { SimIntroView, SimGameView, type GameConfig } from "./SimGame";
import { api } from "./lib/api";
import { calculateSalary, SALARY_TABLE_YEAR } from "./lib/salary";
import { supabase } from "./lib/supabase";
import { EmployerApplicantPanel, EmployerVerification, AdminPanel, NotificationsPanel } from "./Operations";

// ─── Types ───────────────────────────────────────────────────────────────────
type View =
  | "home"
  | "login"
  | "register"
  | "register-employer"
  | "register-worker"
  | "worker-dashboard"
  | "employer-dashboard"
  | "jobs"
  | "job-detail"
  | "help-center"
  | "applications"
  | "post-job"
  | "manage-jobs"
  | "simulator-history"
  | "profile"
  | "sim-intro"
  | "sim-game"
  | "notifications"
  | "admin"
  | "employer-applicants";

type UserRole = "worker" | "employer" | "admin" | null;

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  company?: string;
  cpf?: string; cnpj?: string; phone?: string; city?: string; state?: string;
  education?: string; area?: string; skills?: string; experience?: string; resume?: string;
  sector?: string; company_size?: string;
  verification_status?: "not_required" | "pending" | "approved" | "rejected";
  verification_notes?: string;
}

interface NewAccount {
  name: string;
  email: string;
  password: string;
  role: Exclude<UserRole, null>;
  company?: string;
  cpf?: string; cnpj?: string; phone?: string; city?: string; state?: string;
  education?: string; area?: string; skills?: string; experience?: string; resume?: string;
  sector?: string; size?: string; cert1?: boolean; cert2?: boolean; cert3?: boolean;
}

interface Expense { description: string; category: string; amount: number }
interface SocialProgram { id:number; name:string; kind:"benefit"|"service"; desc:string; req:string; coverage:string; scope:string; city:string; state:string; verifiedAt:string; sources:{name:string;reference_url:string;checked_at:string}[] }
interface Notification { id:string; title:string; message:string; read:boolean; created_at:string }
interface Stats { workers:number; employers:number; activeJobs:number }
interface SimHistory {
  date: string;
  salary: number;
  netSalary: number;
  inss: number;
  irrf: number;
  fgts: number;
  id?: string; kind?: "salary" | "life"; city?: string;
  totalExpenses?: number; finalBalance?: number; expenses?: Expense[];
}

interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  salary: number;
  type: string;
  area: string;
  deadline: string;
  benefits: string[];
  description: string;
  requirements: string[];
  process: string;
  employerId: string;
  status?: "active" | "closed" | "archived"; publishedAt?: string; city?: string; state?: string;
}

interface Application {
  id?: string; workerId?: string; workerName?: string;
  jobId: number;
  jobTitle: string;
  company: string;
  appliedAt: string;
  status: "Em análise" | "Entrevista" | "Reprovado" | "Aprovado";
}

// Cálculo fiscal baseado nas fontes oficiais de INSS e Receita Federal (2026).
const calcSalary = calculateSalary;

// ─── Components ───────────────────────────────────────────────────────────────

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 group">
      <div className="w-8 h-8 bg-primary flex items-center justify-center">
        <span className="text-primary-foreground font-bold text-sm" style={{ fontFamily: "Fraunces, serif" }}>
          TB
        </span>
      </div>
      <span
        className="text-foreground font-semibold text-lg leading-none"
        style={{ fontFamily: "Fraunces, serif" }}
      >
        Trabalhador<br />
        <span className="text-primary text-sm font-normal">Brasileiro</span>
      </span>
    </button>
  );
}

function Nav({
  user,
  onNavigate,
  onLogout,
}: {
  user: User | null;
  onNavigate: (v: View) => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Logo onClick={() => onNavigate("home")} />

        <div className="hidden md:flex items-center gap-6">
          <button
            onClick={() => onNavigate("home")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Simulador
          </button>
          {user?.role === "worker" && (
            <>
              <button
                onClick={() => onNavigate("jobs")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Vagas
              </button>
              <button
                onClick={() => onNavigate("applications")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Candidaturas
              </button>
              <button
                onClick={() => onNavigate("help-center")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Central de Ajuda
              </button>
            </>
          )}
          {user?.role === "employer" && (
            <>
              <button
                onClick={() => onNavigate("post-job")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Publicar Vaga
              </button>
              <button
                onClick={() => onNavigate("manage-jobs")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Gerenciar Vagas
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden md:inline">{user.name.split(" ")[0]}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 bg-card border border-border shadow-lg w-48 py-1 z-50">
                  <button
                    onClick={() => {
                      onNavigate(user.role === "worker" ? "worker-dashboard" : "employer-dashboard");
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    Painel
                  </button>
                  <button
                    onClick={() => { onNavigate("simulator-history"); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    Histórico do Simulador
                  </button>
                  <button
                    onClick={() => { onNavigate("profile"); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    Meu Perfil
                  </button>
                  <hr className="border-border my-1" />
                  <button
                    onClick={() => { onLogout(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-muted transition-colors"
                  >
                    Sair
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={() => onNavigate("login")}
                className="text-sm text-foreground border border-border px-3 py-1.5 hover:bg-muted transition-colors"
              >
                Entrar
              </button>
              <button
                onClick={() => onNavigate("register")}
                className="text-sm bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity"
              >
                Cadastrar
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

// ─── Salary Simulator ─────────────────────────────────────────────────────────
function SalarySimulator({
  onSave,
  compact = false,
}: {
  onSave?: (h: SimHistory) => void;
  compact?: boolean;
}) {
  const [salary, setSalary] = useState(3000);
  const [input, setInput] = useState("3000");
  const calc = calcSalary(salary);

  const handleChange = (v: string) => {
    setInput(v);
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    if (!isNaN(n) && n >= 0) setSalary(n);
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const pct = (n: number) => ((n / salary) * 100).toFixed(1) + "%";

  const handleSave = () => {
    if (!onSave) return;
    onSave({
      date: new Date().toLocaleString("pt-BR").replace(",", ""),
      salary,
      netSalary: calc.net,
      inss: calc.inss,
      irrf: calc.irrf,
      fgts: calc.fgts,
    });
  };

  return (
    <div className={compact ? "" : "bg-card border border-border p-6"}>
      {!compact && (
        <h2
          className="text-2xl font-semibold mb-1"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Simulador Salarial
        </h2>
      )}
      {!compact && (
        <p className="text-muted-foreground text-sm mb-6">
          Estimativa de descontos de CLT com tabelas oficiais de {SALARY_TABLE_YEAR}. Não inclui dependentes ou outras deduções.
        </p>
      )}

      <div className="mb-6">
        <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
          SALÁRIO BRUTO
        </label>
        <div className="flex items-center border border-border bg-background focus-within:border-ring transition-colors">
          <span className="px-3 text-muted-foreground text-sm border-r border-border h-10 flex items-center">R$</span>
          <input
            type="text"
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            className="flex-1 px-3 h-10 bg-transparent text-foreground text-base outline-none"
            placeholder="0,00"
          />
        </div>
        <input
          type="range"
          min={1621}
          max={30000}
          step={100}
          value={salary}
          onChange={(e) => { setSalary(+e.target.value); setInput(String(e.target.value)); }}
          className="w-full mt-3 accent-primary h-1"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1" style={{ fontFamily: "DM Mono, monospace" }}>
          <span>R$ 1.621 (2026)</span>
          <span>R$ 30.000</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: "INSS", value: calc.inss, color: "text-amber-700", desc: pct(calc.inss) },
          { label: "IRRF", value: calc.irrf, color: "text-red-700", desc: pct(calc.irrf) },
          { label: "FGTS (empregador)", value: calc.fgts, color: "text-blue-700", desc: pct(calc.fgts) },
          { label: "SALÁRIO LÍQUIDO", value: calc.net, color: "text-primary", desc: pct(calc.net), highlight: true },
        ].map((item) => (
          <div
            key={item.label}
            className={`p-3 border ${item.highlight ? "border-primary bg-primary/5" : "border-border bg-background"}`}
          >
            <p className="text-xs text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
              {item.label}
            </p>
            <p className={`text-lg font-semibold ${item.color}`} style={{ fontFamily: "Fraunces, serif" }}>
              {fmt(item.value)}
            </p>
            <p className="text-xs text-muted-foreground">{item.desc} do bruto</p>
          </div>
        ))}
      </div>

      {/* Visual bar */}
      <div className="h-3 bg-secondary flex overflow-hidden mb-4">
        <div className="bg-amber-500 h-full transition-all" style={{ width: pct(calc.inss) }} title="INSS" />
        <div className="bg-red-500 h-full transition-all" style={{ width: pct(calc.irrf) }} title="IRRF" />
        <div className="bg-primary h-full transition-all" style={{ width: pct(calc.net) }} title="Líquido" />
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground mb-5">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 inline-block" />INSS</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 inline-block" />IRRF</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-primary inline-block" />Líquido</span>
      </div>

      {onSave && (
        <button
          onClick={handleSave}
          className="w-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Salvar no Histórico
        </button>
      )}
    </div>
  );
}

// ─── Home View ────────────────────────────────────────────────────────────────
function HomeView({
  user,
  onNavigate,
  simHistory,
  onSaveHistory,
  stats,
}: {
  user: User | null;
  onNavigate: (v: View) => void;
  simHistory: SimHistory[];
  onSaveHistory: (h: SimHistory) => void;
  stats: Stats;
}) {
  return (
    <div>
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #1a5c38 60%, #0f3d25 100%)" }}
      >
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p
              className="text-accent text-xs tracking-widest mb-3"
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              PLATAFORMA DO TRABALHADOR BRASILEIRO
            </p>
            <h1
              className="text-4xl md:text-5xl font-semibold text-white leading-tight mb-5"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Conheça seus<br />
              <em className="not-italic text-accent">direitos</em> e<br />
              oportunidades.
            </h1>
            <p className="text-green-100 text-base mb-8 max-w-md">
              Simule seu salário, encontre vagas compatíveis com seu perfil e acesse informações sobre benefícios e assistência social.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate("sim-intro")}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
                style={{ background: "#f0a500", color: "#1a1a1a" }}
              >
                🎮 Jogar o simulador de vida
              </button>
              {!user && (
                <>
                  <button
                    onClick={() => onNavigate("register")}
                    className="bg-white/10 border border-green-300 text-green-100 px-5 py-2.5 text-sm hover:bg-white/20 transition-colors"
                  >
                    Criar conta
                  </button>
                </>
              )}
              {user?.role === "worker" && (
                <button
                  onClick={() => onNavigate("jobs")}
                  className="border border-green-300 text-green-100 px-5 py-2.5 text-sm hover:bg-white/10 transition-colors"
                >
                  Ver vagas
                </button>
              )}
              {user?.role === "employer" && (
                <button
                  onClick={() => onNavigate("post-job")}
                  className="border border-green-300 text-green-100 px-5 py-2.5 text-sm hover:bg-white/10 transition-colors"
                >
                  Publicar vaga
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Trabalhadores cadastrados", value: stats.workers.toLocaleString("pt-BR"), icon: "👷" },
              { label: "Vagas ativas", value: stats.activeJobs.toLocaleString("pt-BR"), icon: "💼" },
              { label: "Empresas verificadas", value: stats.employers.toLocaleString("pt-BR"), icon: "🏭" },
            ].map((s) => (
              <div key={s.label} className="bg-white/10 backdrop-blur-sm p-4 border border-white/20">
                <div className="text-2xl mb-1">{s.icon}</div>
                <div
                  className="text-2xl font-semibold text-white"
                  style={{ fontFamily: "Fraunces, serif" }}
                >
                  {s.value}
                </div>
                <div className="text-xs text-green-200">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Simulator Game CTA Section */}
      <section className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-2 gap-12 items-start">
        <div>
          <p className="text-xs text-muted-foreground tracking-widest mb-2" style={{ fontFamily: "DM Mono, monospace" }}>
            EXPERIÊNCIA INTERATIVA
          </p>
          <h2 className="text-3xl font-semibold mb-4" style={{ fontFamily: "Fraunces, serif" }}>
            Viva um mês com<br />salário mínimo
          </h2>
          <p className="text-muted-foreground mb-6">
            Gerencie seu saldo dia a dia: compre comida, pague contas, use transporte público. Descubra se você consegue chegar ao fim do mês.
          </p>
          <div className="space-y-3 mb-6">
            {[
              "Escolha sua cidade — custos ilustrativos para fins didáticos",
              "8 locais visitáveis: mercado, banco, ponto de ônibus, lanchonete...",
              "Indicadores de fome, sede e contas a pagar",
              "Resumo educacional ao fim da simulação",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span className="text-sm text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate("sim-intro")}
            className="w-full py-3 text-sm font-semibold hover:opacity-90 transition-opacity mb-4"
            style={{ background: "#1a5c38", color: "#f5f0e8" }}
          >
            🎮 Iniciar simulação de vida →
          </button>
          <p className="text-xs text-muted-foreground border-l-2 border-accent pl-3">
            Gratuito, sem necessidade de cadastro. Custos de vida ilustrativos, não indicadores oficiais de preços.
          </p>
        </div>
        <SalarySimulator onSave={user ? onSaveHistory : undefined} />
      </section>

      {/* Features */}
      <section className="bg-muted py-12">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-xs text-muted-foreground tracking-widest mb-2 text-center" style={{ fontFamily: "DM Mono, monospace" }}>
            FUNCIONALIDADES
          </p>
          <h2 className="text-3xl font-semibold text-center mb-8" style={{ fontFamily: "Fraunces, serif" }}>
            Tudo que você precisa em um só lugar
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: "🔍",
                title: "Banco de Vagas",
                desc: "Acesse centenas de vagas compatíveis com o seu perfil profissional. Filtre por área, salário e localidade.",
                action: () => onNavigate("jobs"),
                label: "Ver vagas",
              },
              {
                icon: "📋",
                title: "Central de Ajuda",
                desc: "Saiba quais benefícios sociais você tem direito e quais ONGs podem oferecer suporte na sua região.",
                action: () => onNavigate("help-center"),
                label: "Acessar central",
              },
              {
                icon: "📊",
                title: "Gestão de Candidaturas",
                desc: "Acompanhe o andamento das suas candidaturas na plataforma e retire candidaturas quando necessário.",
                action: user?.role === "worker" ? () => onNavigate("applications") : () => onNavigate("register"),
                label: "Minhas candidaturas",
              },
            ].map((f) => (
              <div key={f.title} className="bg-card border border-border p-6 hover:border-primary/40 transition-colors group">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-lg mb-2" style={{ fontFamily: "Fraunces, serif" }}>
                  {f.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">{f.desc}</p>
                <button
                  onClick={f.action}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  {f.label} →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Auth Views ───────────────────────────────────────────────────────────────
function LoginView({
  onLogin,
  onNavigate,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onNavigate: (v: View) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!email || !password) { setError("Preencha todos os campos."); return; }
    setLoading(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border p-8">
          <h2 className="text-2xl font-semibold mb-1" style={{ fontFamily: "Fraunces, serif" }}>
            Entrar na plataforma
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            Acesse sua conta de trabalhador ou empregador.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                E-MAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring transition-colors"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                SENHA
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring transition-colors"
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && handle()}
              />
            </div>
            <button
              onClick={handle}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Não tem conta?{" "}
            <button onClick={() => onNavigate("register")} className="text-primary hover:underline">
              Cadastre-se gratuitamente
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function RegisterView({ onNavigate }: { onNavigate: (v: View) => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-xl">
        <h2 className="text-3xl font-semibold text-center mb-2" style={{ fontFamily: "Fraunces, serif" }}>
          Criar conta
        </h2>
        <p className="text-muted-foreground text-center text-sm mb-8">
          Escolha o tipo de conta que melhor descreve você.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate("register-worker")}
            className="bg-card border-2 border-border hover:border-primary p-6 text-left transition-colors group"
          >
            <div className="text-4xl mb-3">👷</div>
            <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors" style={{ fontFamily: "Fraunces, serif" }}>
              Sou Trabalhador
            </h3>
            <p className="text-sm text-muted-foreground">
              Acesse vagas, candidature-se a processos seletivos e obtenha informações sobre benefícios e assistência.
            </p>
            <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <li>✓ Banco de vagas personalizado</li>
              <li>✓ Central de benefícios e ONGs</li>
              <li>✓ Acompanhe suas candidaturas</li>
            </ul>
          </button>

          <button
            onClick={() => onNavigate("register-employer")}
            className="bg-card border-2 border-border hover:border-primary p-6 text-left transition-colors group"
          >
            <div className="text-4xl mb-3">🏢</div>
            <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors" style={{ fontFamily: "Fraunces, serif" }}>
              Sou Empregador
            </h3>
            <p className="text-sm text-muted-foreground">
              Publique vagas, defina salários e benefícios e gerencie o processo seletivo da sua empresa.
            </p>
            <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <li>✓ Gestão completa de vagas</li>
              <li>✓ Definição de processos seletivos</li>
              <li>✓ Verificação de autenticidade</li>
            </ul>
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem conta?{" "}
          <button onClick={() => onNavigate("login")} className="text-primary hover:underline">
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Campos de formulário (nível do módulo) ──────────────────────────────────
// Importante: estes componentes NÃO podem ser declarados dentro de outro componente.
// Se fossem, o React os recriaria a cada tecla e o campo perderia o foco.
type FormProps = { form: Record<string, string>; update: (k: string, v: string) => void };

function InputField({ label, k, placeholder, type = "text", form, update }: {
  label: string; k: string; placeholder: string; type?: string;
} & FormProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
        {label}
      </label>
      <input
        type={type}
        value={form[k]}
        onChange={(e) => update(k, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring transition-colors"
      />
    </div>
  );
}

const Field = InputField;

function Textarea({ label, k, placeholder, rows = 3, form, update }: {
  label: string; k: string; placeholder: string; rows?: number;
} & FormProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
        {label}
      </label>
      <textarea
        value={form[k]}
        onChange={(e) => update(k, e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring resize-none"
      />
    </div>
  );
}

function RegisterWorkerView({ onRegister }: { onRegister: (account: NewAccount) => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    cpf: "",
    phone: "",
    city: "",
    state: "",
    education: "",
    area: "",
    skills: "",
    experience: "",
    resume: "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));


  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 flex items-center justify-center text-xs font-bold border ${
                  step >= n
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background border-border text-muted-foreground"
                }`}
              >
                {n}
              </div>
              <span className="text-xs text-muted-foreground">{n === 1 ? "Dados pessoais" : "Perfil profissional"}</span>
              {n < 2 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border p-8">
          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold mb-5" style={{ fontFamily: "Fraunces, serif" }}>
                Dados pessoais
              </h2>
              <div className="space-y-4">
                <InputField form={form} update={update} label="NOME COMPLETO" k="name" placeholder="Maria da Silva" />
                <InputField form={form} update={update} label="E-MAIL" k="email" placeholder="maria@email.com" type="email" />
                <InputField form={form} update={update} label="SENHA" k="password" placeholder="••••••••" type="password" />
                <div className="grid grid-cols-2 gap-4">
                  <InputField form={form} update={update} label="CPF" k="cpf" placeholder="000.000.000-00" />
                  <InputField form={form} update={update} label="TELEFONE" k="phone" placeholder="(11) 99999-9999" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InputField form={form} update={update} label="CIDADE" k="city" placeholder="São Paulo" />
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                      ESTADO
                    </label>
                    <select
                      value={form.state}
                      onChange={(e) => update("state", e.target.value)}
                      className="w-full border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring"
                    >
                      <option value="">Selecione</option>
                      {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStep(2)}
                className="mt-6 w-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Próximo →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold mb-5" style={{ fontFamily: "Fraunces, serif" }}>
                Perfil profissional
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                    ESCOLARIDADE
                  </label>
                  <select
                    value={form.education}
                    onChange={(e) => update("education", e.target.value)}
                    className="w-full border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring"
                  >
                    <option value="">Selecione</option>
                    <option>Ensino fundamental incompleto</option>
                    <option>Ensino fundamental completo</option>
                    <option>Ensino médio incompleto</option>
                    <option>Ensino médio completo</option>
                    <option>Técnico</option>
                    <option>Superior incompleto</option>
                    <option>Superior completo</option>
                    <option>Pós-graduação</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                    ÁREA DE ATUAÇÃO
                  </label>
                  <select
                    value={form.area}
                    onChange={(e) => update("area", e.target.value)}
                    className="w-full border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring"
                  >
                    <option value="">Selecione</option>
                    <option>Comércio</option>
                    <option>Logística</option>
                    <option>Saúde</option>
                    <option>Manutenção</option>
                    <option>Tecnologia</option>
                    <option>Educação</option>
                    <option>Serviços gerais</option>
                    <option>Construção civil</option>
                    <option>Administração</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                    HABILIDADES (separe por vírgula)
                  </label>
                  <input
                    value={form.skills}
                    onChange={(e) => update("skills", e.target.value)}
                    placeholder="Ex: Excel, atendimento ao cliente, CNH categoria B"
                    className="w-full border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                    EXPERIÊNCIA PROFISSIONAL
                  </label>
                  <textarea
                    value={form.experience}
                    onChange={(e) => update("experience", e.target.value)}
                    placeholder="Descreva brevemente suas experiências anteriores..."
                    rows={3}
                    className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring resize-none"
                  />
                </div>
                <div>
                  <label htmlFor="worker-resume" className="block text-xs font-medium text-muted-foreground mb-1">CURRÍCULO / APRESENTAÇÃO PROFISSIONAL</label>
                  <textarea id="worker-resume" value={form.resume} onChange={e=>update("resume",e.target.value)} placeholder="Resumo profissional, qualificações, cursos e objetivos" rows={3} className="w-full border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border border-border py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  ← Voltar
                </button>
                <button
                  onClick={() => onRegister({ ...form, role: "worker" })}
                  className="flex-1 bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Criar conta
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RegisterEmployerView({ onRegister }: { onRegister: (account: NewAccount) => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    cnpj: "",
    company: "",
    sector: "",
    size: "",
    phone: "",
    city: "",
    state: "",
    cert1: false,
    cert2: false,
    cert3: false,
  });

  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 flex items-center justify-center text-xs font-bold border ${
                  step >= n
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background border-border text-muted-foreground"
                }`}
              >
                {n}
              </div>
              <span className="text-xs text-muted-foreground">{n === 1 ? "Dados da empresa" : "Certificações"}</span>
              {n < 2 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border p-8">
          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold mb-5" style={{ fontFamily: "Fraunces, serif" }}>
                Dados da empresa
              </h2>
              <div className="space-y-4">
                {[
                  { label: "NOME DO RESPONSÁVEL", k: "name", placeholder: "João Santos" },
                  { label: "E-MAIL CORPORATIVO", k: "email", placeholder: "rh@empresa.com.br" },
                  { label: "SENHA", k: "password", placeholder: "••••••••", type: "password" },
                  { label: "RAZÃO SOCIAL", k: "company", placeholder: "Empresa XYZ Ltda." },
                  { label: "CNPJ", k: "cnpj", placeholder: "00.000.000/0000-00" },
                ].map((f) => (
                  <div key={f.k}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                      {f.label}
                    </label>
                    <input
                      type={f.type || "text"}
                      value={(form as any)[f.k]}
                      onChange={(e) => update(f.k, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring"
                    />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  {[{label:"TELEFONE COMERCIAL",k:"phone",placeholder:"(11) 3333-4444"},{label:"CIDADE",k:"city",placeholder:"São Paulo"},{label:"ESTADO (UF)",k:"state",placeholder:"SP"}].map(f=><label key={f.k} className="text-xs text-muted-foreground">{f.label}
                    <input value={(form as any)[f.k]} onChange={e=>update(f.k,e.target.value)} placeholder={f.placeholder} maxLength={f.k==="state"?2:100} className="mt-1 w-full border border-border bg-background px-3 h-10 text-sm" />
                  </label>)}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                      SETOR
                    </label>
                    <select
                      value={form.sector}
                      onChange={(e) => update("sector", e.target.value)}
                      className="w-full border border-border bg-background px-3 h-10 text-sm outline-none"
                    >
                      <option value="">Selecione</option>
                      <option>Comércio</option>
                      <option>Indústria</option>
                      <option>Serviços</option>
                      <option>Saúde</option>
                      <option>Tecnologia</option>
                      <option>Construção</option>
                      <option>Agronegócio</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
                      PORTE
                    </label>
                    <select
                      value={form.size}
                      onChange={(e) => update("size", e.target.value)}
                      className="w-full border border-border bg-background px-3 h-10 text-sm outline-none"
                    >
                      <option value="">Selecione</option>
                      <option>MEI</option>
                      <option>Microempresa (até 9 func.)</option>
                      <option>Pequena (10–49 func.)</option>
                      <option>Média (50–249 func.)</option>
                      <option>Grande (250+ func.)</option>
                    </select>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStep(2)}
                className="mt-6 w-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90"
              >
                Próximo →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold mb-2" style={{ fontFamily: "Fraunces, serif" }}>
                Certificações de qualificação
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                Declare os requisitos abaixo. A empresa também precisará enviar documentos e passar por revisão administrativa antes de publicar vagas:
              </p>
              <div className="space-y-3">
                {[
                  { k: "cert1", label: "CNPJ ativo e regularizado junto à Receita Federal" },
                  { k: "cert2", label: "Empresa sem pendências no Cadastro de Empregadores (Lista Suja do MTE)" },
                  { k: "cert3", label: "Responsável pelo cadastro autorizado a recrutar em nome da empresa" },
                ].map((c) => (
                  <label key={c.k} className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={Boolean((form as any)[c.k])} onChange={e=>update(c.k,e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
                    <span className="text-sm text-muted-foreground">{c.label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <strong>Aviso legal:</strong> O fornecimento de informações falsas pode resultar no cancelamento imediato da conta e responsabilização legal.
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border border-border py-2.5 text-sm hover:bg-muted"
                >
                  ← Voltar
                </button>
                <button
                  disabled={!form.cert1 || !form.cert2 || !form.cert3}
                  onClick={() => onRegister({ ...form, role: "employer" })}
                  className="flex-1 bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Criar conta
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Worker Dashboard ─────────────────────────────────────────────────────────
function WorkerDashboard({
  user,
  onNavigate,
  applications,
  simHistory,
}: {
  user: User;
  onNavigate: (v: View) => void;
  applications: Application[];
  simHistory: SimHistory[];
}) {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
            BOM DIA, TRABALHADOR
          </p>
          <h1 className="text-3xl font-semibold mt-1" style={{ fontFamily: "Fraunces, serif" }}>
            Olá, {user.name.split(" ")[0]} 👋
          </h1>
        </div>
        <button
          onClick={() => onNavigate("profile")}
          className="text-sm border border-border px-3 py-1.5 hover:bg-muted transition-colors"
        >
          Editar perfil
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Candidaturas ativas", value: applications.filter(a => a.status !== "Reprovado").length, icon: "📋" },
          { label: "Em análise", value: applications.filter(a => a.status === "Em análise").length, icon: "🔍" },
          { label: "Entrevistas", value: applications.filter(a => a.status === "Entrevista").length, icon: "🗓" },
          { label: "Simulações salvas", value: simHistory.length, icon: "💰" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border p-4">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent applications */}
        <div className="bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ fontFamily: "Fraunces, serif" }}>Candidaturas recentes</h2>
            <button onClick={() => onNavigate("applications")} className="text-xs text-primary hover:underline">Ver todas →</button>
          </div>
          {applications.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground text-sm">Nenhuma candidatura ainda.</p>
              <button onClick={() => onNavigate("jobs")} className="mt-2 text-sm text-primary hover:underline">
                Procurar vagas →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.slice(0, 3).map((a) => (
                <div key={a.jobId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{a.jobTitle}</p>
                    <p className="text-xs text-muted-foreground">{a.company}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          {[
            { icon: "🔍", title: "Buscar vagas", desc: "Ver oportunidades no seu perfil", action: () => onNavigate("jobs") },
            { icon: "🏥", title: "Central de ajuda", desc: "Benefícios sociais e ONGs de apoio", action: () => onNavigate("help-center") },
            { icon: "💰", title: "Simular salário", desc: "Calcule descontos e líquido", action: () => onNavigate("home") },
            { icon: "📈", title: "Histórico de simulações", desc: "Veja suas simulações anteriores", action: () => onNavigate("simulator-history") },
          ].map((a) => (
            <button
              key={a.title}
              onClick={a.action}
              className="w-full bg-card border border-border hover:border-primary/40 p-3.5 flex items-center gap-3 text-left transition-colors"
            >
              <span className="text-xl">{a.icon}</span>
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.desc}</p>
              </div>
              <span className="ml-auto text-muted-foreground text-sm">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Employer Dashboard ───────────────────────────────────────────────────────
function EmployerDashboard({
  user,
  onNavigate,
  jobs,
  applications,
}: {
  user: User;
  onNavigate: (v: View) => void;
  jobs: Job[];
  applications: Application[];
}) {
  const myJobs = jobs.filter((j) => j.employerId === user.id);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
            PAINEL DO EMPREGADOR
          </p>
          <h1 className="text-3xl font-semibold mt-1" style={{ fontFamily: "Fraunces, serif" }}>
            Olá, {user.name.split(" ")[0]} 🏢
          </h1>
        </div>
        <button
          onClick={() => onNavigate("post-job")}
          className="text-sm bg-primary text-primary-foreground px-4 py-2 hover:opacity-90 transition-opacity"
        >
          + Publicar nova vaga
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Vagas ativas", value: myJobs.filter(j=>j.status==="active"&&j.deadline>=new Date().toISOString().slice(0,10)).length, icon: "💼" },
          { label: "Candidatos recebidos", value: applications.length, icon: "👥" },
          { label: "Em entrevista", value: applications.filter(a=>a.status==="Entrevista").length, icon: "🗓" },
          { label: "Vagas encerradas", value: myJobs.filter(j=>j.status!=="active").length, icon: "✅" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border p-4">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ fontFamily: "Fraunces, serif" }}>Minhas vagas</h2>
            <button onClick={() => onNavigate("manage-jobs")} className="text-xs text-primary hover:underline">Gerenciar →</button>
          </div>
          {myJobs.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground text-sm">Nenhuma vaga publicada ainda.</p>
              <button onClick={() => onNavigate("post-job")} className="mt-2 text-sm text-primary hover:underline">
                Publicar vaga →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {myJobs.map((j) => (
                <div key={j.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{j.title}</p>
                    <p className="text-xs text-muted-foreground">{j.location}</p>
                  </div>
                  <span className="text-xs text-primary font-medium" style={{ fontFamily: "DM Mono, monospace" }}>
                    {j.salary.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {[
            { icon: "➕", title: "Publicar nova vaga", desc: "Adicionar vaga ao banco de dados", action: () => onNavigate("post-job") },
            { icon: "📝", title: "Gerenciar vagas", desc: "Editar, estender prazos ou excluir", action: () => onNavigate("manage-jobs") },
            { icon: "👥", title: "Candidaturas recebidas", desc: "Acompanhar os candidatos e mudar status", action: () => onNavigate("employer-applicants") },
            { icon: "💰", title: "Simulador salarial", desc: "Compare faixas e planeje contratações", action: () => onNavigate("home") },
          ].map((a) => (
            <button
              key={a.title}
              onClick={a.action}
              className="w-full bg-card border border-border hover:border-primary/40 p-3.5 flex items-center gap-3 text-left transition-colors"
            >
              <span className="text-xl">{a.icon}</span>
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.desc}</p>
              </div>
              <span className="ml-auto text-muted-foreground text-sm">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Jobs View ────────────────────────────────────────────────────────────────
function JobsView({
  jobs,
  user,
  applications,
  onApply,
  onNavigate,
  setSelectedJob,
}: {
  jobs: Job[];
  user: User | null;
  applications: Application[];
  onApply: (job: Job) => void;
  onNavigate: (v: View) => void;
  setSelectedJob: (j: Job) => void;
}) {
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [stateFilter,setStateFilter] = useState("");
  const [minSalary,setMinSalary] = useState("");

  const areas = [...new Set(jobs.map((j) => j.area))];
  const types = [...new Set(jobs.map((j) => j.type))];

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase();
    return (
      j.status === "active" && j.deadline >= new Date().toISOString().slice(0,10) &&
      (j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.location.toLowerCase().includes(q)) &&
      (!areaFilter || j.area === areaFilter) &&
      (!typeFilter || j.type === typeFilter) &&
      (!stateFilter || j.state === stateFilter) &&
      (!minSalary || j.salary >= Number(minSalary))
    );
  });

  const isApplied = (id: number) => applications.some((a) => a.jobId === id);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
          BANCO DE VAGAS
        </p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>
          Oportunidades de emprego
        </h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cargo, empresa ou cidade..."
          className="flex-1 min-w-64 border border-border bg-background px-3 h-10 text-sm outline-none focus:border-ring"
        />
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="border border-border bg-background px-3 h-10 text-sm outline-none"
        >
          <option value="">Todas as áreas</option>
          {areas.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-border bg-background px-3 h-10 text-sm outline-none"
        >
          <option value="">CLT ou PJ</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select aria-label="Filtrar por estado" value={stateFilter} onChange={e=>setStateFilter(e.target.value)} className="border border-border bg-background px-3 h-10 text-sm">
          <option value="">Todos os estados</option>
          {[...new Set(jobs.map(j=>j.state).filter(Boolean))].sort().map(st=><option key={st}>{st}</option>)}
        </select>
        <input aria-label="Salário mínimo desejado" type="number" min="0" value={minSalary} onChange={e=>setMinSalary(e.target.value)} placeholder="Salário mín. R$" className="w-36 border border-border bg-background px-2 h-10 text-sm" />
      </div>

      {user?.role==="worker"&&user.area&&<p className="text-xs text-muted-foreground mb-2">Sua área de interesse: {user.area}. Use os filtros para encontrar vagas compatíveis.</p>}
      <p className="text-sm text-muted-foreground mb-4">
        {filtered.length} vaga{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
      </p>

      <div className="space-y-3">
        {filtered.map((job) => (
          <div
            key={job.id}
            className="bg-card border border-border p-5 hover:border-primary/40 transition-colors group"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-lg group-hover:text-primary transition-colors" style={{ fontFamily: "Fraunces, serif" }}>
                    {job.title}
                  </h3>
                  <span className="text-xs bg-muted px-2 py-0.5" style={{ fontFamily: "DM Mono, monospace" }}>
                    {job.type}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {job.company} · {job.location}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {job.benefits.slice(0, 3).map((b) => (
                    <span key={b} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 border border-border">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xl font-semibold text-primary" style={{ fontFamily: "Fraunces, serif" }}>
                  {fmt(job.salary)}
                </p>
                <p className="text-xs text-muted-foreground mb-3">bruto/mês</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectedJob(job); onNavigate("job-detail"); }}
                    className="text-xs border border-border px-3 py-1.5 hover:bg-muted transition-colors"
                  >
                    Ver mais
                  </button>
                  {user?.role === "worker" && (
                    <button
                      onClick={() => onApply(job)}
                      disabled={isApplied(job.id)}
                      className={`text-xs px-3 py-1.5 transition-colors ${
                        isApplied(job.id)
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-primary text-primary-foreground hover:opacity-90"
                      }`}
                    >
                      {isApplied(job.id) ? "Inscrito" : "Candidatar"}
                    </button>
                  )}
                  {!user && (
                    <button
                      onClick={() => onNavigate("register")}
                      className="text-xs bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90"
                    >
                      Cadastre-se
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Prazo: {new Date(job.deadline).toLocaleDateString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Job Detail ───────────────────────────────────────────────────────────────
function JobDetailView({
  job,
  user,
  applications,
  onApply,
  onNavigate,
}: {
  job: Job;
  user: User | null;
  applications: Application[];
  onApply: (j: Job) => void;
  onNavigate: (v: View) => void;
}) {
  const isApplied = applications.some((a) => a.jobId === job.id);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={() => onNavigate("jobs")}
        className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1"
      >
        ← Voltar às vagas
      </button>

      <div className="bg-card border border-border p-6 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{job.title}</h1>
              <span className="text-xs bg-muted px-2 py-0.5" style={{ fontFamily: "DM Mono, monospace" }}>{job.type}</span>
            </div>
            <p className="text-muted-foreground">{job.company} · {job.location}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-primary" style={{ fontFamily: "Fraunces, serif" }}>{fmt(job.salary)}</p>
            <p className="text-xs text-muted-foreground">bruto/mês</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ fontFamily: "DM Mono, monospace" }}>DESCRIÇÃO</h3>
            <p className="text-sm text-muted-foreground">{job.description}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ fontFamily: "DM Mono, monospace" }}>REQUISITOS</h3>
            <ul className="space-y-1">
              {job.requirements.map((r) => (
                <li key={r} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">·</span> {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <hr className="border-border my-5" />

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ fontFamily: "DM Mono, monospace" }}>BENEFÍCIOS</h3>
            <div className="flex flex-wrap gap-1.5">
              {job.benefits.map((b) => (
                <span key={b} className="text-xs bg-secondary border border-border px-2 py-1">
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ fontFamily: "DM Mono, monospace" }}>PROCESSO SELETIVO</h3>
            <p className="text-sm text-muted-foreground">{job.process}</p>
          </div>
        </div>

        <hr className="border-border my-5" />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Prazo: <strong>{new Date(job.deadline).toLocaleDateString("pt-BR")}</strong>
          </p>
          {user?.role === "worker" ? (
            <button
              onClick={() => onApply(job)}
              disabled={isApplied}
              className={`px-6 py-2.5 text-sm font-medium ${
                isApplied
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {isApplied ? "✓ Candidatura enviada" : "Candidatar-se à vaga"}
            </button>
          ) : !user ? (
            <button
              onClick={() => onNavigate("register")}
              className="bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Cadastre-se para candidatar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Applications View ────────────────────────────────────────────────────────
function ApplicationsView({
  applications,
  onWithdraw,
  onNavigate,
}: {
  applications: Application[];
  onWithdraw: (jobId: number) => void;
  onNavigate: (v: View) => void;
}) {
  const statusCounts = {
    "Em análise": applications.filter((a) => a.status === "Em análise").length,
    Entrevista: applications.filter((a) => a.status === "Entrevista").length,
    Aprovado: applications.filter((a) => a.status === "Aprovado").length,
    Reprovado: applications.filter((a) => a.status === "Reprovado").length,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
          GESTÃO DE CANDIDATURAS
        </p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>
          Minhas candidaturas
        </h1>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {Object.entries(statusCounts).map(([k, v]) => (
          <div key={k} className="bg-card border border-border p-3 text-center">
            <div className="text-xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{v}</div>
            <div className="text-xs text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>

      {applications.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <p className="text-muted-foreground mb-3">Você ainda não se candidatou a nenhuma vaga.</p>
          <button onClick={() => onNavigate("jobs")} className="bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">
            Ver vagas disponíveis
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((a) => (
            <div key={a.jobId} className="bg-card border border-border p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{a.jobTitle}</p>
                <p className="text-sm text-muted-foreground">{a.company}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Inscrito em {a.appliedAt}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={a.status} />
                {a.status === "Em análise" && (
                  <button
                    onClick={() => onWithdraw(a.jobId)}
                    className="text-xs text-red-600 border border-red-200 px-3 py-1 hover:bg-red-50 transition-colors"
                  >
                    Retirar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Central de ajuda: informações persistidas, de fonte oficial ──────────────
function HelpCenterView({ programs, user }: { programs: SocialProgram[]; user: User | null }) {
  const [activeTab, setActiveTab] = useState<"benefit" | "service">("benefit");
  const [state, setState] = useState(user?.state || "");
  const [city, setCity] = useState(user?.city || "");
  const filtered = programs.filter(p => p.kind === activeTab &&
    (p.scope === "national" || (p.state?.toUpperCase() === state.toUpperCase() &&
       (p.scope === "state" || !city || p.city?.toLowerCase() === city.toLowerCase()))));
  return <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
    <header><p className="text-xs text-muted-foreground">CENTRAL DE AJUDA · FONTES OFICIAIS</p>
      <h1 className="text-3xl font-semibold mb-2">Benefícios e serviços de assistência</h1>
      <p className="text-sm text-muted-foreground">Informações de referência, não avaliação automática de elegibilidade. Consulte sempre o atendimento oficial.</p></header>
    <div className="grid md:grid-cols-2 gap-3">
      <label className="text-sm">Estado (UF)<input aria-label="Estado (UF)" maxLength={2} value={state} onChange={e=>setState(e.target.value.toUpperCase())} placeholder="Ex.: SP" className="mt-1 w-full border border-border bg-background p-2" /></label>
      <label className="text-sm">Cidade<input aria-label="Cidade" value={city} onChange={e=>setCity(e.target.value)} placeholder="Ex.: São Paulo" className="mt-1 w-full border border-border bg-background p-2" /></label>
    </div>
    <div className="flex gap-2 border-b border-border">
      <button onClick={()=>setActiveTab("benefit")} className={`px-4 py-2 ${activeTab==="benefit"?"border-b-2 border-primary font-bold":""}`}>Benefícios sociais</button>
      <button onClick={()=>setActiveTab("service")} className={`px-4 py-2 ${activeTab==="service"?"border-b-2 border-primary font-bold":""}`}>Serviços de apoio</button>
    </div>
    <p className="text-xs text-muted-foreground">{filtered.length} registro(s) verificados. Catálogo inicial nacional, expansível via banco por município/estado.</p>
    {!filtered.length && <p className="border border-border p-6">Nenhum registro disponível para esta região. Consulte o CRAS municipal para orientação.</p>}
    {filtered.map(p=><article className="bg-card border border-border p-5 space-y-2" key={p.id}>
      <h2 className="text-lg font-semibold">{p.name}</h2><p className="text-sm">{p.desc}</p>
      <p className="text-sm text-muted-foreground"><strong>Requisitos / atendimento:</strong> {p.req}</p>
      <p className="text-xs text-muted-foreground">Abrangência: {p.coverage} · Verificado em: {p.verifiedAt}</p>
      <div className="flex flex-wrap gap-3">{p.sources.map(s=><a className="text-sm text-primary underline break-all" key={s.reference_url} href={s.reference_url} target="_blank" rel="noopener noreferrer">Fonte: {s.name} ↗</a>)}</div>
    </article>)}
  </div>;
}

// ─── Post Job View ────────────────────────────────────────────────────────────
function PostJobView({
  onPost,
  onNavigate,
  editingJob,
}: {
  onPost: (j: Partial<Job>) => void;
  onNavigate: (v: View) => void;
  editingJob?: Job | null;
}) {
  const [form, setForm] = useState({
    title: editingJob?.title || "",
    location: editingJob?.location || "",
    salary: editingJob?.salary.toString() || "",
    type: editingJob?.type || "CLT",
    area: editingJob?.area || "",
    deadline: editingJob?.deadline || "",
    benefits: editingJob?.benefits.join(", ") || "",
    description: editingJob?.description || "",
    requirements: editingJob?.requirements.join("\n") || "",
    process: editingJob?.process || "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));



  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
          EMPREGADOR
        </p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>
          {editingJob ? "Editar vaga" : "Publicar nova vaga"}
        </h1>
      </div>

      <div className="bg-card border border-border p-6 space-y-5">
        <div className="grid md:grid-cols-2 gap-5">
          <Field form={form} update={update} label="TÍTULO DA VAGA" k="title" placeholder="Ex: Auxiliar de Logística" />
          <Field form={form} update={update} label="LOCALIDADE" k="location" placeholder="Ex: São Paulo, SP" />
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <Field form={form} update={update} label="SALÁRIO (R$)" k="salary" placeholder="Ex: 2200" type="number" />
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
              REGIME
            </label>
            <select
              value={form.type}
              onChange={(e) => update("type", e.target.value)}
              className="w-full border border-border bg-background px-3 h-10 text-sm outline-none"
            >
              <option>CLT</option>
              <option>PJ</option>
              <option>CLT/PJ</option>
              <option>Temporário</option>
              <option>Estágio</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
              ÁREA
            </label>
            <select
              value={form.area}
              onChange={(e) => update("area", e.target.value)}
              className="w-full border border-border bg-background px-3 h-10 text-sm outline-none"
            >
              <option value="">Selecione</option>
              <option>Comércio</option>
              <option>Logística</option>
              <option>Saúde</option>
              <option>Manutenção</option>
              <option>Tecnologia</option>
              <option>Educação</option>
              <option>Serviços gerais</option>
              <option>Construção civil</option>
              <option>Administração</option>
            </select>
          </div>
        </div>
        <Field form={form} update={update} label="PRAZO DE INSCRIÇÃO" k="deadline" placeholder="" type="date" />
        <Field form={form} update={update}
          label="BENEFÍCIOS (separe por vírgula)"
          k="benefits"
          placeholder="Ex: Vale-transporte, Vale-refeição R$30/dia, Plano de saúde"
        />
        <Textarea form={form} update={update} label="DESCRIÇÃO DA VAGA" k="description" placeholder="Descreva as responsabilidades e atividades..." rows={4} />
        <Textarea form={form} update={update}
          label="REQUISITOS (um por linha)"
          k="requirements"
          placeholder={"Ensino médio completo\nDisponibilidade para turnos\nExperiência com Excel"}
          rows={3}
        />
        <Textarea form={form} update={update}
          label="PROCESSO SELETIVO"
          k="process"
          placeholder="Ex: Triagem de currículos → Entrevista presencial → Exame admissional"
          rows={2}
        />
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => onNavigate("employer-dashboard")}
            className="flex-1 border border-border py-2.5 text-sm hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onPost({
                title: form.title,
                location: form.location,
                salary: parseFloat(form.salary),
                type: form.type,
                area: form.area,
                deadline: form.deadline,
                benefits: form.benefits.split(",").map((b) => b.trim()).filter(Boolean),
                description: form.description,
                requirements: form.requirements.split("\n").filter(Boolean),
                process: form.process,
                id: editingJob?.id,
              });
            }}
            className="flex-1 bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90"
          >
            {editingJob ? "Salvar alterações" : "Publicar vaga"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manage Jobs View ─────────────────────────────────────────────────────────
function ManageJobsView({
  jobs,
  ownerId,
  onDelete,
  onExtend,
  onNavigate,
  onEdit,
}: {
  jobs: Job[];
  ownerId: string;
  onDelete: (id: number) => void;
  onExtend: (id: number) => void;
  onNavigate: (v: View) => void;
  onEdit: (job: Job) => void;
}) {
  const myJobs = jobs.filter((j) => j.employerId === ownerId);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
            GESTÃO DE VAGAS
          </p>
          <h1 className="text-3xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>
            Minhas vagas
          </h1>
        </div>
        <button
          onClick={() => onNavigate("post-job")}
          className="bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90"
        >
          + Nova vaga
        </button>
      </div>

      {myJobs.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <p className="text-muted-foreground mb-3">Você ainda não publicou nenhuma vaga.</p>
          <button onClick={() => onNavigate("post-job")} className="bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">
            Publicar primeira vaga
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {myJobs.map((j) => (
            <div key={j.id} className="bg-card border border-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-lg" style={{ fontFamily: "Fraunces, serif" }}>{j.title}</h3>
                  <p className="text-sm text-muted-foreground">{j.location} · {j.type}</p>
                  <p className="text-sm font-medium text-primary mt-1" style={{ fontFamily: "DM Mono, monospace" }}>
                    {fmt(j.salary)}/mês
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-3">
                    Prazo: {new Date(j.deadline+"T12:00:00").toLocaleDateString("pt-BR")} · {j.status === "active" ? "Ativa" : "Encerrada"}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={()=>onEdit(j)} className="text-xs border border-border px-3 py-1.5 hover:bg-muted">Editar</button>
                    <button
                      onClick={() => onExtend(j.id)}
                      className="text-xs border border-border px-3 py-1.5 hover:bg-muted transition-colors"
                    >
                      Estender prazo
                    </button>
                    <button
                      onClick={() => onDelete(j.id)}
                      className="text-xs border border-red-200 text-red-600 px-3 py-1.5 hover:bg-red-50 transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sim History View ─────────────────────────────────────────────────────────
function SimHistoryView({
  history,
  onNavigate,
}: {
  history: SimHistory[];
  onNavigate: (v: View) => void;
}) {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1" style={{ fontFamily: "DM Mono, monospace" }}>
          HISTÓRICO
        </p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>
          Simulações salvas
        </h1>
      </div>

      {history.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <p className="text-muted-foreground mb-3">Nenhuma simulação salva ainda.</p>
          <button onClick={() => onNavigate("home")} className="bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">
            Ir para o simulador
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((h, i) => (
            <div key={i} className="bg-card border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                  {h.date}
                </p>
                <span className="text-2xl font-semibold text-primary" style={{ fontFamily: "Fraunces, serif" }}>
                  {fmt(h.salary)}
                </span>
              </div>
              {h.kind === "life" && <div className="mb-3 text-sm"><p><strong>Simulação de vida {h.city ? `· ${h.city}` : ""}</strong></p><p>Despesas: {fmt(h.totalExpenses||0)} · Saldo final: {fmt(h.finalBalance||0)}</p>
                {(h.expenses||[]).map((e,i)=><p className="text-xs text-muted-foreground" key={i}>{e.category}: {fmt(e.amount)}</p>)}</div>}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "INSS", value: h.inss, color: "text-amber-700" },
                  { label: "IRRF", value: h.irrf, color: "text-red-700" },
                  { label: "FGTS", value: h.fgts, color: "text-blue-700" },
                  { label: "LÍQUIDO", value: h.netSalary, color: "text-primary" },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-muted-foreground mb-0.5" style={{ fontFamily: "DM Mono, monospace" }}>
                      {item.label}
                    </p>
                    <p className={`text-sm font-semibold ${item.color}`}>{fmt(item.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profile View ─────────────────────────────────────────────────────────────
function ProfileView({ user, onUpdate }: { user:User; onUpdate:(data:Partial<User>)=>Promise<void> }) {
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState<Partial<User>>({...user});
  const keys:[keyof User,string][]=[ ["name","Nome"],["phone","Telefone"],["city","Cidade"],["state","Estado (UF)"],
    ...(user.role==="worker"?[["education","Escolaridade"],["area","Área de atuação"],["skills","Habilidades"],["experience","Experiência"],["resume","Currículo / apresentação"]] as [keyof User,string][]
    : [["sector","Setor da empresa"],["company_size","Porte da empresa"]] as [keyof User,string][]) ];
  return <div className="max-w-2xl mx-auto px-4 py-8">
    <h1 className="text-3xl font-semibold mb-6">Meu perfil</h1>
    <div className="bg-card border border-border p-6 space-y-4">
      <p className="text-sm text-muted-foreground">E-mail: {user.email}</p>
      <p className="text-sm text-muted-foreground">{user.role==="worker"?`CPF: ${user.cpf||"Não informado"}`:`Empresa: ${user.company||""} · CNPJ: ${user.cnpj||""}`}</p>
      {user.role==="employer"&&<p className="text-sm font-semibold">Verificação documental: {user.verification_status === "approved"?"Aprovado":user.verification_status==="rejected"?"Rejeitado — reenvie documentos":"Pendente"} {user.verification_notes||""}</p>}
      {keys.map(([key,label])=><label key={key} className="block text-xs text-muted-foreground">{label}
        {editing?<textarea rows={key==="resume"||key==="experience"?3:1} value={String(form[key]||"")} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} className="mt-1 w-full p-2 bg-background border border-border text-sm" />
          :<p className="text-sm text-foreground mt-1">{String(user[key]||"Não informado")}</p>}
      </label>)}
      {editing?<div className="flex gap-3"><button onClick={()=>setEditing(false)} className="border border-border p-2">Cancelar</button><button className="bg-primary text-primary-foreground p-2" onClick={async()=>{try{await onUpdate(form);setEditing(false);}catch(e){alert(e instanceof Error?e.message:"Não foi possível salvar");}}}>Salvar</button></div>
        :<button className="bg-primary text-primary-foreground p-2" onClick={()=>{setForm({...user});setEditing(true);}}>Editar perfil</button>}
    </div>
  </div>;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Application["status"] }) {
  const map: Record<Application["status"], string> = {
    "Em análise": "bg-amber-100 text-amber-800 border-amber-200",
    Entrevista: "bg-blue-100 text-blue-800 border-blue-200",
    Aprovado: "bg-green-100 text-green-800 border-green-200",
    Reprovado: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 border ${map[status]}`}
      style={{ fontFamily: "DM Mono, monospace" }}
    >
      {status.toUpperCase()}
    </span>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer({ onNavigate }: { onNavigate: (v: View) => void }) {
  return (
    <footer className="bg-foreground text-background mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-3 gap-8">
        <div>
          <p className="font-semibold text-lg mb-2" style={{ fontFamily: "Fraunces, serif" }}>
            Trabalhador Brasileiro
          </p>
          <p className="text-sm text-background/60">
            Plataforma dedicada a conectar trabalhadores e empregadores brasileiros com dignidade e transparência.
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-background/50 mb-3" style={{ fontFamily: "DM Mono, monospace" }}>
            PLATAFORMA
          </p>
          <div className="space-y-2">
            {[
              { label: "Simulador Salarial", view: "home" as View },
              { label: "Banco de Vagas", view: "jobs" as View },
              { label: "Central de Ajuda", view: "help-center" as View },
            ].map((l) => (
              <button
                key={l.label}
                onClick={() => onNavigate(l.view)}
                className="block text-sm text-background/70 hover:text-background transition-colors"
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-background/50 mb-3" style={{ fontFamily: "DM Mono, monospace" }}>
            INFORMAÇÕES
          </p>
          <p className="text-xs text-background/50">
            © 2026 Trabalhador Brasileiro. Dados baseados na legislação brasileira vigente. Este é um protótipo educacional.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>("home");
  const [user, setUser] = useState<User | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [simHistory, setSimHistory] = useState<SimHistory[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError] = useState("");
  const [stats,setStats] = useState<Stats>({workers:0,employers:0,activeJobs:0});
  const [programs,setPrograms] = useState<SocialProgram[]>([]);
  const [notifications,setNotifications] = useState<Notification[]>([]);
  const [employerApplications,setEmployerApplications]=useState<Application[]>([]);
  const [editingJob,setEditingJob]=useState<Job|null>(null);

  const navigate = useCallback((v: View) => { if(v==="post-job")setEditingJob(null);setView(v); }, []);

  const loadData = useCallback(async () => {
    const data = await api<{
      jobs: Job[];
      profile: User | null;
      applications: Application[];
      simulations: SimHistory[];
      programs: SocialProgram[]; stats: Stats; notifications: Notification[]; employerApplications: Application[];
    }>("/bootstrap");
    setJobs(data.jobs);setStats(data.stats);setPrograms(data.programs);setNotifications(data.notifications);setEmployerApplications(data.employerApplications);
    setLoadError("");
    setUser(data.profile);
    setApplications(data.applications);
    setSimHistory(data.simulations);
    return data.profile;
  }, []);

  useEffect(() => {
    loadData()
      .catch((error) => {console.error("Erro ao carregar dados:", error);setLoadError(error instanceof Error ? error.message : "Falha no carregamento.");})
      .finally(() => setLoading(false));
  }, [loadData]);

  const handleLogin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("E-mail ou senha inválidos.");
    const profile = await loadData();
    if (!profile) throw new Error("Não foi possível carregar seu perfil.");
    setView(profile.role === "admin" ? "admin" : profile.role === "employer" ? "employer-dashboard" : "worker-dashboard");
  };

  const handleRegister = async (account: NewAccount) => {
    try {
      const result = await api<{requiresEmailConfirmation:boolean;needsEmployerVerification:boolean}>("/signup", {
        method: "POST", body: JSON.stringify(account),
      });
      if(result.requiresEmailConfirmation){alert("Conta criada! Confirme o e-mail pelo link enviado e depois entre. Caso seja empregador, envie os documentos após entrar.");setView("login");}
      else await handleLogin(account.email, account.password);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível criar a conta.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setApplications([]);
    setSimHistory([]);setNotifications([]);setEmployerApplications([]);
    await loadData();
    setView("home");
  };

  const handleApply = async (job: Job) => {
    if (applications.some((a) => a.jobId === job.id)) return;
    try {
      const { application } = await api<{ application: Application }>("/applications", {
        method: "POST",
        body: JSON.stringify({
          jobId: job.id,
        }),
      });
      setApplications((prev) => [...prev, application]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível enviar a candidatura.");
    }
  };

  const handleWithdraw = async (jobId: number) => {
    try {
      await api(`/applications/${jobId}`, { method: "DELETE" });
      setApplications((prev) => prev.filter((a) => a.jobId !== jobId));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível retirar a candidatura.");
    }
  };

  const handlePostJob = async (job: Partial<Job>) => {
    try {
      const data = await api<{ job: Job }>(job.id ? `/jobs/${job.id}` : "/jobs", {
        method: job.id ? "PUT" : "POST",
        body: JSON.stringify(job),
      });
      setJobs((prev) => job.id ? prev.map(j=>j.id===job.id?data.job:j) : [...prev, data.job]);
      setEditingJob(null);setView("manage-jobs");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível publicar a vaga.");
    }
  };

  const handleDeleteJob = async (id: number) => {
    try {
      await api(`/jobs/${id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível excluir a vaga.");
    }
  };

  const handleExtendJob = async (id: number) => {
    try {
      const { job } = await api<{ job: Job }>(`/jobs/${id}/extend`, { method: "PUT" });
      setJobs((prev) => prev.map((item) => item.id === id ? job : item));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível estender o prazo.");
    }
  };

  const handleSaveSimulation = async (simulation: SimHistory) => {
    if (!user) {
      setView("login");
      return;
    }
    try {
      const data = await api<{ simulation: SimHistory }>("/simulations", {
        method: "POST",
        body: JSON.stringify(simulation),
      });
      setSimHistory((prev) => [data.simulation, ...prev]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível salvar a simulação.");
    }
  };

  const handleUpdateProfile = async (changes: Partial<User>) => {
    const { profile } = await api<{ profile: User }>("/profile", {
      method: "PUT",
      body: JSON.stringify(changes),
    });
    setUser(profile);
  };

  const handleApplicationStatus = async (id:string,status:string) => {
    const {application} = await api<{application:Application}>(`/applications/${id}/status`,{method:"PUT",body:JSON.stringify({status})});
    setEmployerApplications(prev=>prev.map(a=>a.id===id?{...a,status:application.status}:a));
  };
  const handleRead = async (id:string) => {
    await api(`/notifications/${id}/read`,{method:"PUT"});
    setNotifications(prev=>prev.map(n=>n.id===id?{...n,read:true}:n));
  };

  const renderView = () => {
    switch (view) {
      case "home":
        return (
          <HomeView
            user={user}
            onNavigate={navigate}
            simHistory={simHistory}
            onSaveHistory={handleSaveSimulation}
            stats={stats}
          />
        );
      case "login":
        return <LoginView onLogin={handleLogin} onNavigate={navigate} />;
      case "register":
        return <RegisterView onNavigate={navigate} />;
      case "register-worker":
        return <RegisterWorkerView onRegister={handleRegister} />;
      case "register-employer":
        return <RegisterEmployerView onRegister={handleRegister} />;
      case "worker-dashboard":
        return user ? (
          <WorkerDashboard user={user} onNavigate={navigate} applications={applications} simHistory={simHistory} />
        ) : null;
      case "employer-dashboard":
        return user ? (
          <EmployerDashboard user={user} onNavigate={navigate} jobs={jobs} applications={employerApplications} />
        ) : null;
      case "jobs":
        return (
          <JobsView
            jobs={jobs}
            user={user}
            applications={applications}
            onApply={handleApply}
            onNavigate={navigate}
            setSelectedJob={setSelectedJob}
          />
        );
      case "job-detail":
        return selectedJob ? (
          <JobDetailView
            job={selectedJob}
            user={user}
            applications={applications}
            onApply={handleApply}
            onNavigate={navigate}
          />
        ) : null;
      case "help-center":
        return <HelpCenterView programs={programs} user={user} />;
      case "applications":
        return (
          <ApplicationsView applications={applications} onWithdraw={handleWithdraw} onNavigate={navigate} />
        );
      case "post-job":
        return <PostJobView key={editingJob?.id || "new"} editingJob={editingJob} onPost={handlePostJob} onNavigate={navigate} />;
      case "manage-jobs":
        return (
          <ManageJobsView
            jobs={jobs}
            ownerId={user?.id || ""}
            onDelete={handleDeleteJob}
            onExtend={handleExtendJob}
            onNavigate={navigate}
            onEdit={(j)=>{setEditingJob(j);setView("post-job");}}
          />
        );
      case "simulator-history":
        return <SimHistoryView history={simHistory} onNavigate={navigate} />;
      case "profile":
        return user ? <div><ProfileView user={user} onUpdate={handleUpdateProfile} />
          {user.role==="employer"&&<div className="max-w-2xl mx-auto px-4 pb-6"><EmployerVerification status={user.verification_status} notes={user.verification_notes} onUploaded={async()=>{await loadData();}} /></div>}
        </div> : null;
      case "employer-applicants":
        return user?.role==="employer"||user?.role==="admin" ? <EmployerApplicantPanel applications={employerApplications} onStatus={handleApplicationStatus}/> : null;
      case "admin":
        return user?.role==="admin"?<AdminPanel refresh={loadData} jobs={jobs} onArchive={async id=>{await api(`/jobs/${id}`,{method:"DELETE"});await loadData();}}/>:null;
      case "notifications":
        return user?<NotificationsPanel items={notifications} onRead={handleRead}/>:null;
      case "sim-intro":
        return (
          <SimIntroView
            onStart={(cfg) => {
              setGameConfig(cfg);
              setView("sim-game");
            }}
          />
        );
      case "sim-game":
        return gameConfig ? (
          <SimGameView config={gameConfig} onQuit={() => navigate("home")} onComplete={user ? handleSaveSimulation : undefined} />
        ) : null;
      default:
        return null;
    }
  };

  const isAuthView = view === "login" || view === "register" || view === "register-worker" || view === "register-employer";
  const isFullscreenView = view === "sim-intro" || view === "sim-game";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Carregando plataforma...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!isAuthView && !isFullscreenView && <Nav user={user} onNavigate={navigate} onLogout={handleLogout} />}
      {!isAuthView && !isFullscreenView && user && <nav aria-label="Ações da conta" className="flex flex-wrap justify-end gap-3 px-5 py-2 text-sm border-b border-border">
        {user.role==="employer"&&user.verification_status!=="approved"&&<button className="text-amber-700 underline" onClick={()=>setView("profile")}>Verificação: {user.verification_status||"pendente"} — enviar documentos</button>}
        {user.role==="employer"&&<button className="text-primary underline" onClick={()=>setView("employer-applicants")}>Candidatos ({employerApplications.length})</button>}
        {user.role==="admin"&&<button className="text-primary underline" onClick={()=>setView("admin")}>Administração</button>}
        <button className="text-primary underline" onClick={()=>setView("notifications")}>Notificações ({notifications.filter(n=>!n.read).length})</button>
      </nav>}
      {loadError&&<div role="alert" className="bg-amber-50 border-b border-amber-200 text-amber-950 px-5 py-3 text-sm">Backend não disponível: {loadError} <button className="underline ml-3" onClick={()=>void loadData().catch(e=>setLoadError(String(e)))}>Tentar novamente</button></div>}
      <main className="flex-1">{renderView()}</main>
      {!isAuthView && !isFullscreenView && <Footer onNavigate={navigate} />}
    </div>
  );
}
