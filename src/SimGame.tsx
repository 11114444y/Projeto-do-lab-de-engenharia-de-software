import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CityData {
  state: string;
  transport: number;
  mealOut: number;
  snack: number;
  groceriesCheap: number;
  groceriesQuality: number;
  rent: number;
  electricity: number;
  waterBill: number;
  internet: number;
  monthlyPass: number; // pre-paid transit pass
}

export interface GameConfig {
  city: string;
  grossSalary: number;
  netSalary: number;
  month: number;
  startWeek: number;
}

interface Bill {
  id: string;
  name: string;
  amount: number;
  dueWeek: number; // week of the month (1-4) when it must be paid
  dueDay: number;  // display day of month
  paid: boolean;
  healthPenaltyIfUnpaid?: number;
}

interface LogEntry {
  id: number;
  week: number;
  text: string;
  type: "income" | "expense" | "warning" | "info" | "system" | "good";
  amount?: number;
}

interface WeekTracker {
  groceryTier: "none" | "cheap" | "quality";
  snackCount: number;
  mealCount: number;
  visitedDoctor: boolean;
  visitedPraca: boolean;
  transportTrips: number;
}

interface GameState {
  week: number;
  balance: number;
  hunger: number;
  health: number;
  energy: number;
  bills: Bill[];
  log: LogEntry[];
  phase: "playing" | "lost" | "won";
  loseReason?: string;
  totalSpent: number;
  spentByCategory: Record<string, number>;
  tracker: WeekTracker;
  location: LocationId;
  logId: number;
  needsDoctor: boolean;
  hasMonthlyPass: boolean;
}

type LocationId =
  | "casa"
  | "mercado"
  | "postosaude"
  | "estacao"
  | "trabalho"
  | "praca"
  | "lanchonete"
  | "banco";

// ─── City data ────────────────────────────────────────────────────────────────
export const CITIES: Record<string, CityData> = {
  "São Paulo": { state: "SP", transport: 5.30, mealOut: 16, snack: 8, groceriesCheap: 48, groceriesQuality: 90, rent: 800, electricity: 75, waterBill: 90, internet: 70, monthlyPass: 176 },
  "Rio de Janeiro": { state: "RJ", transport: 5.00, mealOut: 13, snack: 7, groceriesCheap: 42, groceriesQuality: 78, rent: 1550, electricity: 160, waterBill: 150, internet: 70, monthlyPass: 148 },
  "Belo Horizonte": { state: "MG", transport: 6.25, mealOut: 11, snack: 6, groceriesCheap: 38, groceriesQuality: 70, rent: 1200, electricity: 55, waterBill: 150, internet: 90, monthlyPass: 128 },
  "Porto Alegre": { state: "RS", transport: 5.3, mealOut: 11, snack: 6, groceriesCheap: 40, groceriesQuality: 72, rent: 900, electricity: 100, waterBill: 60, internet: 70, monthlyPass: 122 },
  "Salvador": { state: "BA", transport: 5.90, mealOut: 10, snack: 5, groceriesCheap: 35, groceriesQuality: 62, rent: 900, electricity: 80, waterBill: 50, internet: 70, monthlyPass: 112 },
  "Fortaleza": { state: "CE", transport: 5.40, mealOut: 9, snack: 5, groceriesCheap: 33, groceriesQuality: 58, rent: 600, electricity: 90, waterBill: 55, internet: 70, monthlyPass: 96 },
  "Recife": { state: "PE", transport: 4.50, mealOut: 9, snack: 5, groceriesCheap: 34, groceriesQuality: 60, rent: 800, electricity: 100, waterBill: 75, internet: 60, monthlyPass: 97 },
  "Manaus": { state: "AM", transport: 5.00, mealOut: 10, snack: 5, groceriesCheap: 38, groceriesQuality: 68, rent: 650, electricity: 200, waterBill: 80, internet: 80, monthlyPass: 89 },
};

export const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const clamp  = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt    = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function calcSalaryNet(gross: number) {
  let inss = gross <= 1412 ? gross * 0.075 : gross <= 2666.68 ? gross * 0.09 : gross <= 4000.03 ? gross * 0.12 : gross <= 7786.02 ? gross * 0.14 : 7786.02 * 0.14;
  const base = gross - inss;
  let irrf = base > 4664.68 ? base * 0.275 - 896 : base > 3751.05 ? base * 0.225 - 662.77 : base > 2826.65 ? base * 0.15 - 394.16 : base > 2259.2 ? base * 0.075 - 169.44 : 0;
  if (irrf < 0) irrf = 0;
  return round2(gross - inss - irrf);
}

function makeBills(city: CityData, startWeek: number): Bill[] {
  return [
    { id: "rent",        name: "Aluguel",      amount: city.rent,        dueWeek: 1, dueDay: 5,  paid: startWeek > 1 },
    { id: "water",       name: "Água",         amount: city.waterBill,   dueWeek: 2, dueDay: 10, paid: startWeek > 2, healthPenaltyIfUnpaid: 5 },
    { id: "electricity", name: "Luz",          amount: city.electricity, dueWeek: 3, dueDay: 20, paid: startWeek > 3, healthPenaltyIfUnpaid: 3 },
    { id: "internet",    name: "Internet",     amount: city.internet,    dueWeek: 4, dueDay: 25, paid: startWeek > 4 },
  ];
}

function freshTracker(): WeekTracker {
  return { groceryTier: "none", snackCount: 0, mealCount: 0, visitedDoctor: false, visitedPraca: false, transportTrips: 0 };
}

function initGame(config: GameConfig): GameState {
  const city = CITIES[config.city];
  const workTransport = round2(city.transport * 2 * 5);
  const startBal = round2(config.netSalary - workTransport);
  return {
    week: config.startWeek,
    balance: startBal < 0 ? config.netSalary : startBal,
    hunger: 80, health: 85, energy: 90,
    bills: makeBills(city, config.startWeek),
    log: [
      { id: 0, week: config.startWeek, text: `Salário líquido recebido: ${fmt(config.netSalary)}`, type: "income", amount: config.netSalary },
      { id: 1, week: config.startWeek, text: `Transporte ao trabalho (sem. 1, 5 dias): −${fmt(workTransport)}`, type: "expense", amount: workTransport },
    ],
    phase: "playing",
    totalSpent: workTransport + city.rent,
    spentByCategory: { "Transporte": workTransport, "Moradia": city.rent },
    tracker: freshTracker(),
    location: "casa",
    logId: 3,
    needsDoctor: false,
    hasMonthlyPass: false,
  };
}

function computeWeekEnd(state: GameState, config: GameConfig): GameState {
  const t = state.tracker;
  let hungerDelta = -30;
  if (t.groceryTier === "cheap")   hungerDelta += 58;
  if (t.groceryTier === "quality") hungerDelta += 65;
  hungerDelta += t.snackCount * 10 + t.mealCount * 20;

  let energyDelta = -35 + 20;
  if (t.visitedPraca) energyDelta += 10;

  let healthDelta = -8 + 8; // work stress offset by rest days
  if (t.groceryTier === "quality") healthDelta += 7;
  else if (t.groceryTier === "cheap") healthDelta -= 5;
  else healthDelta -= 8;
  if (t.snackCount >= 4 && t.groceryTier !== "quality") healthDelta -= 6;
  if (t.visitedPraca) healthDelta += 5;
  const newEnergy = clamp(state.energy + energyDelta, 0, 100);
  if (newEnergy > 60)  healthDelta += 5;
  if (state.energy < 20) healthDelta -= 5;
  const waterOverdue = state.bills.find(b => b.id === "water" && !b.paid && b.dueWeek < state.week);
  if (waterOverdue) healthDelta -= 5;
  const elecOverdue = state.bills.find(b => b.id === "electricity" && !b.paid && b.dueWeek < state.week);
  if (elecOverdue) healthDelta -= 3;

  return {
    ...state,
    hunger: clamp(state.hunger + hungerDelta, 0, 100),
    health: clamp(state.health + healthDelta, 0, 100),
    energy: newEnergy,
    needsDoctor: clamp(state.health + healthDelta, 0, 100) < 30,
  };
}

// ─── Location definitions ─────────────────────────────────────────────────────
interface LocationDef {
  id: LocationId;
  name: string;
  emoji: string;
  tileColor: string;
  borderColor: string;
  description: string;
  freeTravel: boolean;
  col: number; // logical 1–3
  row: number; // logical 1–3
}

const LOCATION_DEFS: LocationDef[] = [
  { id: "casa",       name: "Sua Casa",        emoji: "🏠", tileColor: "#fef9ee", borderColor: "#d4a853", description: "Sua residência. Ponto de partida.",                    freeTravel: true,  col: 1, row: 1 },
  { id: "mercado",    name: "Supermercado",     emoji: "🛒", tileColor: "#f0fdf4", borderColor: "#22c55e", description: "Compras semanais de alimentação.",                     freeTravel: false, col: 2, row: 1 },
  { id: "postosaude", name: "Posto de Saúde",   emoji: "🏥", tileColor: "#fff1f2", borderColor: "#f43f5e", description: "Consultas médicas e medicamentos.",                    freeTravel: false, col: 3, row: 1 },
  { id: "estacao",    name: "Estação",          emoji: "🚉", tileColor: "#eff6ff", borderColor: "#3b82f6", description: "Estação de trem/metrô. Compre o passe mensal aqui.",   freeTravel: false, col: 1, row: 2 },
  { id: "praca",      name: "Praça / Parque",   emoji: "🌿", tileColor: "#f0fdf4", borderColor: "#86efac", description: "Descanse nos fins de semana. Gratuito.",               freeTravel: true,  col: 2, row: 2 },
  { id: "lanchonete", name: "Lanchonete",       emoji: "🍽️", tileColor: "#fff7ed", borderColor: "#f97316", description: "Refeições e lanches avulsos.",                        freeTravel: false, col: 3, row: 2 },
  { id: "trabalho",   name: "Trabalho",         emoji: "🏗️", tileColor: "#f8fafc", borderColor: "#94a3b8", description: "Seu local de trabalho. Commute via Estação.",         freeTravel: false, col: 1, row: 3 },
  { id: "banco",      name: "Banco / Lotérica", emoji: "🏦", tileColor: "#f5f3ff", borderColor: "#8b5cf6", description: "Pague suas contas aqui.",                             freeTravel: false, col: 2, row: 3 },
];

// ─── Cartoon avatar ───────────────────────────────────────────────────────────
function CartoonAvatar({ moving }: { moving: boolean }) {
  return (
    <svg width="34" height="40" viewBox="0 0 34 40" style={{ overflow: "visible", display: "block" }}>
      {/* Shadow */}
      <ellipse cx="17" cy="38" rx="9" ry="3" fill="rgba(0,0,0,0.22)" />
      {/* Body */}
      <rect x="10" y="21" width="14" height="11" rx="3" fill="#1a5c38" />
      {/* Arms — swing when moving */}
      {moving ? (
        <>
          <line x1="10" y1="23" x2="4"  y2="19" stroke="#fcd9aa" strokeWidth="3" strokeLinecap="round" />
          <line x1="24" y1="23" x2="30" y2="27" stroke="#fcd9aa" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="10" y1="24" x2="5"  y2="28" stroke="#fcd9aa" strokeWidth="3" strokeLinecap="round" />
          <line x1="24" y1="24" x2="29" y2="28" stroke="#fcd9aa" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {/* Head */}
      <circle cx="17" cy="13" r="11" fill="#fcd9aa" />
      {/* Hair */}
      <path d="M7 11 Q17 2 27 11 Q25 5 17 4 Q9 5 7 11Z" fill="#4a3728" />
      {/* Eyes */}
      <circle cx="13" cy="13" r="2.3" fill="white" />
      <circle cx="21" cy="13" r="2.3" fill="white" />
      <circle cx="13.4" cy="13.4" r="1.2" fill="#1a1a1a" />
      <circle cx="21.4" cy="13.4" r="1.2" fill="#1a1a1a" />
      <circle cx="13.9" cy="12.9" r="0.5" fill="white" />
      <circle cx="21.9" cy="12.9" r="0.5" fill="white" />
      {/* Mouth */}
      {moving
        ? <ellipse cx="17" cy="18" rx="3.5" ry="2" fill="#c0604a" />
        : <path d="M13.5 17.5 Q17 20.5 20.5 17.5" stroke="#c0604a" strokeWidth="1.5" fill="none" strokeLinecap="round" />}
      {/* Hat */}
      <rect x="12" y="4"  width="10" height="5" rx="1.5" fill="#f0a500" />
      <rect x="9"  y="8"  width="16" height="2.5" rx="0.5" fill="#f0a500" />
    </svg>
  );
}

// ─── Stat bar ─────────────────────────────────────────────────────────────────
function StatBar({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-muted-foreground">{label}</span>
          <span style={{ color, fontFamily: "DM Mono, monospace" }}>{value}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

const statColor = (v: number) => v > 60 ? "#22c55e" : v > 30 ? "#f97316" : "#ef4444";

// ─── SimIntroView ─────────────────────────────────────────────────────────────
export function SimIntroView({ onStart }: { onStart: (c: GameConfig) => void }) {
  const [step, setStep] = useState<"intro" | "setup">("intro");
  const [city, setCity]         = useState("São Paulo");
  const [salaryInput, setSalaryInput] = useState("1412");
  const [month, setMonth]       = useState(8);
  const [startWeek, setStartWeek] = useState(1);

  const gross    = parseFloat(salaryInput) || 1412;
  const net      = calcSalaryNet(gross);
  const cityData = CITIES[city];
  const estMonthly = cityData.rent + cityData.transport * 2 * 22 + cityData.groceriesCheap * 4 + cityData.waterBill + cityData.electricity + cityData.internet;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #0f2d1a 0%, #1a5c38 60%, #0a1f10 100%)" }}>
      {step === "intro" ? (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="text-6xl mb-5">🏙️</div>
          <p className="text-xs tracking-widest mb-3" style={{ fontFamily: "DM Mono, monospace", color: "#f0a500" }}>SIMULADOR DE VIDA — TRABALHADOR BRASILEIRO</p>
          <h1 className="text-4xl md:text-5xl font-semibold text-white mb-6 leading-tight" style={{ fontFamily: "Fraunces, serif" }}>
            Como é viver com<br /><em className="not-italic" style={{ color: "#f0a500" }}>salário mínimo</em> no Brasil?
          </h1>

          <div className="bg-white/10 border border-white/20 p-6 mb-6 text-left">
            <h2 className="text-white font-semibold mb-4" style={{ fontFamily: "Fraunces, serif" }}>📋 Como funciona</h2>
            <div className="space-y-2.5 text-sm text-green-100">
              {[
                ["🗺️", "Mapa animado", "Clique nos ícones do mapa — seu avatar se desloca com uma linha de rota desenhada até o destino."],
                ["🚉", "Commute em 2 etapas", "Indo para o trabalho? Seu avatar passa pela Estação primeiro, depois segue até o trabalho."],
                ["⏱️", "Gestão semanal", "O mês tem 4 semanas. Cuide de alimentação, saúde e contas a cada semana."],
                ["😴", "Fins de semana recuperam", "2 dias de descanso automáticos restauram energia e saúde. Sair nesses dias custa passagem extra."],
                ["🛒", "Qualidade da dieta importa", "Cesta básica sustenta mas prejudica a saúde. Cesta com frutas melhora."],
                ["💊", "Saúde crítica", "Abaixo de 30%, você precisará de médico urgente."],
              ].map(([icon, title, desc]) => (
                <div key={String(title)} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0">{icon}</span>
                  <div><strong className="text-white">{title}: </strong>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { icon: "🍞", label: "Fome",   desc: "Coma semanalmente" },
              { icon: "❤️", label: "Saúde",  desc: "Dieta e descanso" },
              { icon: "⚡", label: "Energia", desc: "Trabalho cansa, parque restaura" },
            ].map(s => (
              <div key={s.label} className="bg-white/10 border border-white/20 p-3 text-center">
                <div className="text-2xl mb-1">{s.icon}</div>
                <p className="text-white text-xs font-semibold">{s.label}</p>
                <p className="text-green-200 text-xs">{s.desc}</p>
              </div>
            ))}
          </div>

          <button onClick={() => setStep("setup")} className="px-8 py-3 text-sm font-semibold hover:opacity-90 transition-opacity" style={{ background: "#f0a500", color: "#1a1a1a" }}>
            Configurar simulação →
          </button>
        </div>
      ) : (
        <div className="max-w-xl mx-auto px-4 py-12">
          <button onClick={() => setStep("intro")} className="text-green-300 text-sm mb-8 flex items-center gap-1 hover:text-white">← Voltar</button>
          <p className="text-xs tracking-widest mb-2" style={{ fontFamily: "DM Mono, monospace", color: "#f0a500" }}>CONFIGURAR SIMULAÇÃO</p>
          <h2 className="text-3xl font-semibold text-white mb-8" style={{ fontFamily: "Fraunces, serif" }}>Defina seu cenário</h2>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-green-200 mb-1.5" style={{ fontFamily: "DM Mono, monospace" }}>CIDADE</label>
              <select value={city} onChange={e => setCity(e.target.value)} className="w-full bg-white/10 border border-white/30 text-white px-3 h-11 text-sm outline-none">
                {Object.keys(CITIES).map(c => <option key={c} value={c} style={{ color: "#1a1a1a" }}>{c} — {CITIES[c].state}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-green-200 mb-1.5" style={{ fontFamily: "DM Mono, monospace" }}>SALÁRIO BRUTO (R$)</label>
              <div className="flex border border-white/30 focus-within:border-yellow-400">
                <span className="px-3 h-11 flex items-center text-green-200 text-sm border-r border-white/30">R$</span>
                <input type="number" value={salaryInput} onChange={e => setSalaryInput(e.target.value)}
                  className="flex-1 bg-transparent text-white px-3 h-11 text-sm outline-none" min={1412} step={100} />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-green-300">
                <span>Mínimo: R$ 1.412</span>
                <span>Líquido: <strong className="text-white">{fmt(net)}</strong></span>
              </div>
              <input type="range" min={1412} max={10000} step={100} value={gross}
                onChange={e => setSalaryInput(e.target.value)} className="w-full mt-2 h-1" style={{ accentColor: "#f0a500" }} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-green-200 mb-1.5" style={{ fontFamily: "DM Mono, monospace" }}>MÊS</label>
                <select value={month} onChange={e => setMonth(+e.target.value)} className="w-full bg-white/10 border border-white/30 text-white px-3 h-11 text-sm outline-none">
                  {MONTHS.map((m, i) => <option key={m} value={i} style={{ color: "#1a1a1a" }}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-green-200 mb-1.5" style={{ fontFamily: "DM Mono, monospace" }}>SEMANA INICIAL</label>
                <select value={startWeek} onChange={e => setStartWeek(+e.target.value)} className="w-full bg-white/10 border border-white/30 text-white px-3 h-11 text-sm outline-none">
                  {[1,2,3,4].map(w => <option key={w} value={w} style={{ color: "#1a1a1a" }}>Semana {w}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-white/10 border border-white/20 p-4">
              <p className="text-xs text-white/50 mb-3" style={{ fontFamily: "DM Mono, monospace" }}>CUSTOS ESTIMADOS — {city.toUpperCase()} / MÊS</p>
              <div className="space-y-1.5 text-sm">
                {[
                  ["Aluguel (quarto/studio)",       cityData.rent],
                  ["Transporte (~22 dias)",          round2(cityData.transport * 2 * 22)],
                  ["Alimentação (estimativa básica)",round2(cityData.groceriesCheap * 4)],
                  ["Água + Luz + Internet",          cityData.waterBill + cityData.electricity + cityData.internet],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} className="flex justify-between">
                    <span className="text-green-200">{lbl}</span>
                    <span className="text-white font-medium">{fmt(Number(val))}</span>
                  </div>
                ))}
                <div className="border-t border-white/20 pt-2 flex justify-between font-semibold">
                  <span className="text-green-200">Total estimado</span>
                  <span style={{ color: net < estMonthly ? "#f87171" : "#86efac" }}>{fmt(estMonthly)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-white">Seu salário líquido</span>
                  <span className="text-white">{fmt(net)}</span>
                </div>
                {net < estMonthly && (
                  <p className="text-xs text-red-300 mt-1">⚠️ Despesas superam o salário em {fmt(estMonthly - net)}. Escolhas difíceis à frente.</p>
                )}
              </div>
            </div>

            <button onClick={() => onStart({ city, grossSalary: gross, netSalary: net, month, startWeek })}
              className="w-full py-3 font-semibold text-sm hover:opacity-90 transition-opacity" style={{ background: "#f0a500", color: "#1a1a1a" }}>
              🎮 Iniciar simulação — {MONTHS[month]}, Semana {startWeek}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Animation system types ───────────────────────────────────────────────────
interface PathSegment { x1: number; y1: number; x2: number; y2: number }
interface AvatarState  { x: number; y: number; moving: boolean; segments: PathSegment[] }

// ─── SimGameView ──────────────────────────────────────────────────────────────
export function SimGameView({ config, onQuit }: { config: GameConfig; onQuit: () => void }) {
  const city = CITIES[config.city];
  const [gs, setGs]   = useState<GameState>(() => initGame(config));
  const [showSummary, setShowSummary] = useState(false);
  const [summaryDeltas, setSummaryDeltas] = useState<{ h: number; health: number; e: number } | null>(null);

  // ── Animation state ──────────────────────────────────────────────────────
  const mapRef   = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Partial<Record<LocationId, HTMLButtonElement>>>({});
  const [avatar, setAvatar] = useState<AvatarState | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const logRef   = useRef<HTMLDivElement>(null);

  // Place avatar at home on mount
  useEffect(() => {
    const place = () => {
      const pos = getTileCenter("casa");
      if (pos) { setAvatar({ x: pos.x, y: pos.y, moving: false, segments: [] }); return true; }
      return false;
    };
    if (!place()) { const t = setTimeout(place, 200); return () => clearTimeout(t); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [gs.log.length]);

  const getTileCenter = useCallback((id: LocationId | string): { x: number; y: number } | null => {
    const el = tileRefs.current[id as LocationId];
    const map = mapRef.current;
    if (!el || !map) return null;
    const er = el.getBoundingClientRect();
    const mr = map.getBoundingClientRect();
    if (!mr.width) return null;
    return {
      x: (er.left + er.width / 2 - mr.left) / mr.width * 100,
      y: (er.top  + er.height / 2 - mr.top) / mr.height * 100,
    };
  }, []);

  // Helper: animate avatar through a sequence of waypoints
  const animateAlong = useCallback((from: LocationId, waypoints: LocationId[], onDone: () => void) => {
    const allPts = [from, ...waypoints];
    const segments: PathSegment[] = [];

    // Pre-build all segments
    for (let i = 0; i < allPts.length - 1; i++) {
      const a = getTileCenter(allPts[i]);
      const b = getTileCenter(allPts[i + 1]);
      if (a && b) segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }

    const startPos = getTileCenter(from);
    if (!startPos) { onDone(); return; }

    // Place avatar at start immediately (no transition yet)
    setAvatar({ x: startPos.x, y: startPos.y, moving: false, segments: [] });

    // Step through waypoints
    let step = 0;
    const STEP_MS  = 780; // ms per leg
    const PAUSE_MS = 320; // pause at intermediate stops

    const advance = () => {
      if (step >= waypoints.length) {
        // Arrived at final destination
        setIsMoving(false);
        setAvatar(prev => prev ? { ...prev, moving: false } : null);
        // Fade lines out
        setTimeout(() => setAvatar(prev => prev ? { ...prev, segments: [] } : null), 1000);
        onDone();
        return;
      }

      const destPt = getTileCenter(allPts[step + 1]);
      if (!destPt) { step++; advance(); return; }

      // Show all segments up to and including this one
      const visibleSegs = segments.slice(0, step + 1);
      setAvatar(prev => prev ? { ...prev, moving: true, segments: visibleSegs } : null);

      // Small delay so React renders the line, then kick off CSS transition
      setTimeout(() => {
        setAvatar(prev => prev ? { ...prev, x: destPt.x, y: destPt.y } : null);
        step++;

        if (step < waypoints.length) {
          // Intermediate stop — pause briefly then continue
          setTimeout(advance, STEP_MS + PAUSE_MS);
        } else {
          // Final destination
          setTimeout(advance, STEP_MS);
        }
      }, 60);
    };

    advance();
  }, [getTileCenter]);

  // ── State helpers ────────────────────────────────────────────────────────
  const addLog = (s: GameState, text: string, type: LogEntry["type"], amount?: number): GameState => ({
    ...s, log: [...s.log, { id: s.logId, week: s.week, text, type, amount }], logId: s.logId + 1,
  });

  const spend = (s: GameState, amount: number, category: string): GameState => ({
    ...s,
    balance: round2(s.balance - amount),
    totalSpent: round2(s.totalSpent + amount),
    spentByCategory: { ...s.spentByCategory, [category]: round2((s.spentByCategory[category] || 0) + amount) },
  });

  const checkLose = (s: GameState): GameState => {
    if (s.phase !== "playing") return s;
    if (s.balance < -0.01)
      return { ...s, phase: "lost", loseReason: "Saldo ficou negativo. Não foi possível cobrir os gastos." };
    if (s.hunger <= 0)
      return { ...s, phase: "lost", loseReason: "Semanas sem alimentação adequada. Saúde colapsou." };
    if (s.health <= 0)
      return { ...s, phase: "lost", loseReason: "Saúde chegou a zero por negligência com dieta, descanso e cuidados." };
    const rentOverdue = s.bills.find(b => b.id === "rent" && !b.paid && b.dueWeek + 1 < s.week);
    if (rentOverdue)
      return { ...s, phase: "lost", loseReason: "Aluguel em atraso. Você foi despejado." };
    return s;
  };

  // ── Move to location (with animation) ───────────────────────────────────
  const moveTo = useCallback((dest: LocationId) => {
    if (isMoving || dest === gs.location || gs.phase !== "playing") return;

    const destDef = LOCATION_DEFS.find(l => l.id === dest)!;
    const currentDef = LOCATION_DEFS.find(l => l.id === gs.location)!;

    // Determine waypoints
    // Going to Trabalho: route through Estação (unless already there)
    const isCommute = dest === "trabalho";
    const waypoints: LocationId[] = isCommute
      ? (gs.location === "estacao" ? ["trabalho"] : ["estacao", "trabalho"])
      : [dest];

    // Transport cost: single fare for any non-free destination
    // (For commute, one fare covers full trip; if already at estacao, free to reach trabalho)
    const needsFare = !destDef.freeTravel && !(isCommute && gs.location === "estacao");
    if (needsFare && gs.balance < city.transport) {
      setGs(prev => addLog(prev, `⚠️ Sem saldo para passagem (${fmt(city.transport * 2)}).`, "warning"));
      return;
    }

    // Prevent buying monthly pass twice
    if (dest === "estacao" && currentDef.id === "estacao") return;

    setIsMoving(true);

    animateAlong(gs.location, waypoints, () => {
      // Apply effects after animation completes
      setGs(prev => {
        let s = { ...prev, location: dest };
        if (needsFare) {
          const fare = round2(city.transport);
          s = spend(s, fare, "Transporte");
          s.tracker = { ...s.tracker, transportTrips: s.tracker.transportTrips + 1 };
          s = addLog(s, `Viagem a ${destDef.name}: passagem ${fmt(fare)}`, "expense", fare);
        }
        if (dest === "praca") s.tracker = { ...s.tracker, visitedPraca: true };
        return checkLose(s);
      });
    });
  }, [isMoving, gs.location, gs.phase, gs.balance, city, animateAlong]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Location actions ─────────────────────────────────────────────────────
  const doAction = (actionId: string) => {
    if (isMoving) return;
    setGs(prev => {
      if (prev.phase !== "playing") return prev;
      let s = { ...prev };
      switch (actionId) {
        case "groceries-cheap": {
          if (s.tracker.groceryTier !== "none") return addLog(s, "Você já fez compras esta semana.", "info");
          if (s.balance < city.groceriesCheap) return addLog(s, `Saldo insuficiente (${fmt(city.groceriesCheap)}).`, "warning");
          s = spend(s, city.groceriesCheap, "Alimentação");
          s.tracker = { ...s.tracker, groceryTier: "cheap" };
          s.hunger = clamp(s.hunger + 15, 0, 100);
          s = addLog(s, `Cesta básica (processados): ${fmt(city.groceriesCheap)} — sustenta, baixa nutrição.`, "expense", city.groceriesCheap);
          break;
        }
        case "groceries-quality": {
          if (s.tracker.groceryTier !== "none") return addLog(s, "Você já fez compras esta semana.", "info");
          if (s.balance < city.groceriesQuality) return addLog(s, `Saldo insuficiente (${fmt(city.groceriesQuality)}).`, "warning");
          s = spend(s, city.groceriesQuality, "Alimentação");
          s.tracker = { ...s.tracker, groceryTier: "quality" };
          s.hunger = clamp(s.hunger + 20, 0, 100);
          s.health = clamp(s.health + 3, 0, 100);
          s = addLog(s, `Cesta completa com frutas e verduras: ${fmt(city.groceriesQuality)} — melhora a saúde.`, "good", city.groceriesQuality);
          break;
        }
        case "snack": {
          if (s.balance < city.snack) return addLog(s, `Saldo insuficiente (${fmt(city.snack)}).`, "warning");
          s = spend(s, city.snack, "Alimentação");
          s.tracker = { ...s.tracker, snackCount: s.tracker.snackCount + 1 };
          s.hunger = clamp(s.hunger + 10, 0, 100);
          s = addLog(s, `Lanche: ${fmt(city.snack)}`, "expense", city.snack);
          if (s.tracker.snackCount >= 4) s = addLog(s, "⚠️ Muitos lanches sem refeições prejudicam a saúde.", "warning");
          break;
        }
        case "meal": {
          if (s.balance < city.mealOut) return addLog(s, `Saldo insuficiente (${fmt(city.mealOut)}).`, "warning");
          s = spend(s, city.mealOut, "Alimentação");
          s.tracker = { ...s.tracker, mealCount: s.tracker.mealCount + 1 };
          s.hunger = clamp(s.hunger + 20, 0, 100);
          s = addLog(s, `Refeição completa: ${fmt(city.mealOut)}`, "expense", city.mealOut);
          break;
        }
        case "doctor": {
          const total = 120;
          if (s.balance < total) return addLog(s, `Saldo insuficiente (${fmt(total)}).`, "warning");
          s = spend(s, total, "Saúde");
          s.tracker = { ...s.tracker, visitedDoctor: true };
          s.health = clamp(s.health + 25, 0, 100);
          s.needsDoctor = false;
          s = addLog(s, `Consulta + medicamentos: ${fmt(total)}. +25% saúde.`, "good", total);
          break;
        }
        case "medicine-only": {
          const cost = 35;
          if (s.balance < cost) return addLog(s, `Saldo insuficiente (${fmt(cost)}).`, "warning");
          s = spend(s, cost, "Saúde");
          s.health = clamp(s.health + 10, 0, 100);
          s = addLog(s, `Remédios avulsos: ${fmt(cost)}. +10% saúde.`, "expense", cost);
          break;
        }
        case "monthly-pass": {
          if (s.hasMonthlyPass) return addLog(s, "Você já tem passe mensal.", "info");
          const cost = city.monthlyPass;
          if (s.balance < cost) return addLog(s, `Saldo insuficiente para passe mensal (${fmt(cost)}).`, "warning");
          s = spend(s, cost, "Transporte");
          s.hasMonthlyPass = true;
          s = addLog(s, `Passe mensal de transporte: ${fmt(cost)}. Próximas viagens com 40% de desconto!`, "good", cost);
          break;
        }
        case "rest-praca": {
          s.tracker = { ...s.tracker, visitedPraca: true };
          s = addLog(s, "Descansou no parque. +energia +saúde ao fim da semana.", "info");
          s.energy = clamp(s.energy + 20, 0, 100)
          break;
        }
        default:
          if (actionId.startsWith("pay-")) {
            const billId = actionId.replace("pay-", "");
            const bill = s.bills.find(b => b.id === billId);
            if (!bill || bill.paid) break;
            if (s.balance < bill.amount) return addLog(s, `Saldo insuficiente para ${bill.name} (${fmt(bill.amount)}).`, "warning");
            s = spend(s, bill.amount, "Contas");
            s.bills = s.bills.map(b => b.id === billId ? { ...b, paid: true } : b);
            s = addLog(s, `${bill.name} paga: ${fmt(bill.amount)}`, "expense", bill.amount);
          }
          break;
      }
      return checkLose(s);
    });
  };

  // ── Advance week ──────────────────────────────────────────────────────────
  const advanceWeek = () => {
    if (isMoving) return;
    setGs(prev => {
      const before = { h: prev.hunger, health: prev.health, e: prev.energy };
      let s = computeWeekEnd(prev, config);
      const nextWeek = prev.week + 1;

      if (nextWeek > 4) {
        s = addLog({ ...s, phase: "won" }, "🎉 Fim do mês! Você completou as 4 semanas.", "good");
        return s;
      }

      // Work transport for next week
      const workFare = round2(city.transport * 2 * 5 * (s.hasMonthlyPass ? 0.6 : 1));
      if (s.balance >= workFare) s = spend(s, workFare, "Transporte");

      s = { ...s, week: nextWeek, tracker: freshTracker(), location: "casa" };
      s = addLog(s, `━━ Semana ${nextWeek} de ${MONTHS[config.month]} ━━`, "system");
      s = addLog(s, `Transporte trabalho: −${fmt(workFare)}${s.hasMonthlyPass ? " (passe)" : ""}`, "expense", workFare);

      s.bills.forEach(bill => {
        if (!bill.paid && bill.dueWeek === nextWeek) s = addLog(s, `📄 ${bill.name} vence esta semana (dia ${bill.dueDay}): ${fmt(bill.amount)}`, "warning");
        if (!bill.paid && bill.dueWeek < nextWeek) s = addLog(s, `🔴 ${bill.name} em atraso! (dia ${bill.dueDay}): ${fmt(bill.amount)}`, "warning");
      });
      if (s.hunger < 30)  s = addLog(s, "😰 Fome crítica!", "warning");
      if (s.health < 30)  s = addLog(s, "❤️ Saúde crítica! Vá ao posto de saúde.", "warning");
      if (s.energy < 20)  s = addLog(s, "⚡ Energia baixa. Descanse no parque.", "warning");

      setSummaryDeltas({ h: s.hunger - before.h, health: s.health - before.health, e: s.energy - before.e });
      setShowSummary(true);

      // Move avatar back to casa
      setTimeout(() => {
        const casaPos = getTileCenter("casa");
        if (casaPos) setAvatar(prev => prev ? { ...prev, x: casaPos.x, y: casaPos.y, moving: false, segments: [] } : null);
      }, 100);

      return checkLose(s);
    });
  };

  // ── Derive actions for current location ──────────────────────────────────
  const getActions = (): { id: string; label: string; cost: number; icon: string; note?: string }[] => {
    switch (gs.location) {
      case "mercado": return [
        { id: "groceries-cheap",   label: "Cesta básica (processados)",   cost: city.groceriesCheap,   icon: "🧺", note: "Sustenta, mas −saúde ao longo do tempo" },
        { id: "groceries-quality", label: "Cesta completa (com frutas)",   cost: city.groceriesQuality, icon: "🥦", note: "Nutritiva — +saúde, custa mais" },
      ];
      case "lanchonete": return [
        { id: "snack", label: "Lanche avulso",      cost: city.snack,   icon: "🥪", note: "Alivia a fome levemente. Muitos = −saúde" },
        { id: "meal",  label: "Refeição completa",  cost: city.mealOut, icon: "🍽️", note: "Mais nutritivo que só lanche" },
      ];
      case "postosaude": {
        const acts = [];
        if (gs.needsDoctor || gs.health < 50) acts.push({ id: "doctor", label: "Consulta + medicamentos", cost: 120, icon: "👨‍⚕️", note: "+25% saúde" });
        acts.push({ id: "medicine-only", label: "Remédios avulsos", cost: 35, icon: "💊", note: "+10% saúde" });
        return acts;
      }
      case "estacao": {
        const acts: ReturnType<typeof getActions> = [];
        if (!gs.hasMonthlyPass) {
          const savings = round2(city.transport * 2 * 22 - city.transport * 2 * 22 * 0.6);
          acts.push({ id: "monthly-pass", label: "Comprar Passe Mensal", cost: city.monthlyPass, icon: "🎫", note: `Economiza ~${fmt(savings)} em transporte vs pagar por viagem` });
        } else {
          acts.push({ id: "_info", label: "✓ Passe mensal ativo", cost: 0, icon: "🎫", note: "Desconto de 40% em transporte" });
        }
        return acts;
      }
      case "banco": return gs.bills.filter(b => !b.paid).map(b => ({
        id: `pay-${b.id}`, label: `Pagar ${b.name}`, cost: b.amount, icon: "📄",
        note: b.dueWeek < gs.week ? `🔴 Em atraso! (vencia dia ${b.dueDay})` : b.dueWeek === gs.week ? `⚠️ Vence esta semana (dia ${b.dueDay})` : `Vence dia ${b.dueDay}`,
      }));
      case "praca": return [{ id: "rest-praca", label: "Descansar no parque", cost: 0, icon: "🌿", note: "Gratuito — +energia +saúde nos fins de semana" }];
      default: return [];
    }
  };

  const actions = getActions();
  const currentLocDef = LOCATION_DEFS.find(l => l.id === gs.location)!;
  const unpaidDue = gs.bills.filter(b => !b.paid && b.dueWeek <= gs.week);

  if (gs.phase === "lost") return <SimGameOverView gs={gs} config={config} onRestart={() => { setGs(initGame(config)); setAvatar(null); }} onQuit={onQuit} />;
  if (gs.phase === "won")  return <SimSummaryView gs={gs} config={config} onQuit={onQuit} />;

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ maxHeight: "100vh", overflow: "hidden" }}>
      {/* Top bar */}
      <div className="bg-foreground text-background px-3 py-2 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onQuit} className="text-xs opacity-60 hover:opacity-100">← Sair</button>
          <div>
            <span className="text-xs opacity-50" style={{ fontFamily: "DM Mono, monospace" }}>{MONTHS[config.month].toUpperCase()}</span>
            <span className="text-sm font-semibold ml-2">Semana {gs.week} de 4</span>
          </div>
          <div className="hidden md:flex gap-1">
            {[1,2,3,4].map(w => (
              <div key={w} className={`w-5 h-1.5 rounded-full ${w < gs.week ? "bg-green-400" : w === gs.week ? "bg-yellow-400" : "bg-white/20"}`} />
            ))}
          </div>
          {gs.hasMonthlyPass && (
            <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded hidden md:inline" style={{ fontFamily: "DM Mono, monospace" }}>🎫 PASSE MENSAL</span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs opacity-50" style={{ fontFamily: "DM Mono, monospace" }}>SALDO</p>
          <p className="text-lg font-bold leading-none" style={{ fontFamily: "Fraunces, serif", color: gs.balance < 100 ? "#f87171" : "#86efac" }}>
            {fmt(gs.balance)}
          </p>
        </div>
      </div>

      {/* Stat bars */}
      <div className="bg-card border-b border-border px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <StatBar label="Fome"   value={gs.hunger} icon="🍞" color={statColor(gs.hunger)} />
        <StatBar label="Saúde"  value={gs.health} icon="❤️" color={statColor(gs.health)} />
        <StatBar label="Energia" value={gs.energy} icon="⚡" color={gs.energy > 60 ? "#60a5fa" : gs.energy > 30 ? "#f97316" : "#ef4444"} />
        {gs.needsDoctor && (
          <div className="flex-shrink-0 text-xs bg-red-100 border border-red-300 text-red-700 px-2 py-1 flex items-center gap-1">
            🏥 Saúde crítica!
          </div>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Map area */}
        <div className="flex-1 p-4 flex flex-col">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2" style={{ fontFamily: "DM Mono, monospace" }}>
            <span>BAIRRO — CLIQUE PARA SE DESLOCAR</span>
            {isMoving && <span className="text-primary animate-pulse">em trânsito…</span>}
          </p>

          {/* The map grid — position:relative so SVG and avatar sit on top */}
          <div
            ref={mapRef}
            className="flex-1"
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1fr 26px 1fr 26px 1fr",
              gridTemplateRows: "1fr 26px 1fr 26px 1fr",
              background: "#2d5a1e",
              minHeight: 250,
              overflow: "hidden",
            }}
          >
            {/* Street cells */}
            <div style={{ gridColumn: 2, gridRow: "1/6", background: "#737373" }} />
            <div style={{ gridColumn: 4, gridRow: "1/6", background: "#737373" }} />
            <div style={{ gridColumn: "1/6", gridRow: 2, background: "#737373" }} />
            <div style={{ gridColumn: "1/6", gridRow: 4, background: "#737373" }} />
            {/* Crossings */}
            <div style={{ gridColumn: 2, gridRow: 2, background: "#8a8a8a" }} />
            <div style={{ gridColumn: 4, gridRow: 2, background: "#8a8a8a" }} />
            <div style={{ gridColumn: 2, gridRow: 4, background: "#8a8a8a" }} />
            <div style={{ gridColumn: 4, gridRow: 4, background: "#8a8a8a" }} />

            {/* Empty cells (grass) */}
            <div style={{ gridColumn: 3, gridRow: 5, background: "#2d5a1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ opacity: 0.25, fontSize: 18 }}>🌿</span>
            </div>
            <div style={{ gridColumn: 5, gridRow: 5, background: "#2d5a1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ opacity: 0.15, fontSize: 14 }}>🌳</span>
            </div>

            {/* Location tiles */}
            {LOCATION_DEFS.map(loc => {
              const isActive = gs.location === loc.id;
              const cssCol = loc.col * 2 - 1;
              const cssRow = loc.row * 2 - 1;
              const alertDot = (loc.id === "postosaude" && gs.needsDoctor) || (loc.id === "banco" && unpaidDue.length > 0) || (loc.id === "estacao" && !gs.hasMonthlyPass && gs.week === 1);

              return (
                <button
                  key={loc.id}
                  ref={el => { tileRefs.current[loc.id] = el ?? undefined; }}
                  onClick={() => moveTo(loc.id)}
                  disabled={isMoving}
                  style={{
                    gridColumn: cssCol,
                    gridRow: cssRow,
                    background: isActive ? loc.tileColor : "rgba(255,255,255,0.90)",
                    border: `2px solid ${isActive ? loc.borderColor : "transparent"}`,
                    cursor: isMoving ? "not-allowed" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    padding: "5px 3px",
                    transition: "background 0.2s, border 0.2s",
                    position: "relative",
                  }}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div style={{ position: "absolute", top: 3, left: 3, width: 7, height: 7, background: loc.borderColor, borderRadius: "50%" }} />
                  )}
                  {/* Alert dot */}
                  {alertDot && (
                    <div style={{ position: "absolute", top: 3, right: 3, width: 9, height: 9, background: "#ef4444", borderRadius: "50%", border: "1.5px solid white" }} />
                  )}
                  {/* Unpaid bill count badge */}
                  {loc.id === "banco" && unpaidDue.length > 0 && (
                    <div style={{ position: "absolute", top: 2, right: 2, background: "#f97316", color: "white", fontSize: 8, width: 14, height: 14, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                      {unpaidDue.length}
                    </div>
                  )}
                  <span style={{ fontSize: 20 }}>{loc.emoji}</span>
                  <span style={{ fontSize: 9, fontFamily: "DM Mono, monospace", textAlign: "center", lineHeight: 1.2, fontWeight: isActive ? 700 : 400, color: "#374151" }}>
                    {loc.name}
                  </span>
                  {loc.freeTravel && (
                    <span style={{ fontSize: 8, color: "#16a34a", fontFamily: "DM Mono, monospace" }}>grátis</span>
                  )}
                </button>
              );
            })}

            {/* ── SVG path lines overlay ─────────────────────────────────── */}
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: 5 }}
              preserveAspectRatio="none"
            >
              <defs>
                <filter id="line-glow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              {avatar?.segments.map((seg, i) => (
                <g key={i}>
                  {/* Glow shadow */}
                  <line
                    x1={`${seg.x1}%`} y1={`${seg.y1}%`}
                    x2={`${seg.x2}%`} y2={`${seg.y2}%`}
                    stroke="rgba(240,165,0,0.35)" strokeWidth="6" strokeLinecap="round"
                  />
                  {/* Solid base line */}
                  <line
                    x1={`${seg.x1}%`} y1={`${seg.y1}%`}
                    x2={`${seg.x2}%`} y2={`${seg.y2}%`}
                    stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.5"
                  />
                  {/* Animated dashes */}
                  <line
                    x1={`${seg.x1}%`} y1={`${seg.y1}%`}
                    x2={`${seg.x2}%`} y2={`${seg.y2}%`}
                    stroke="#f0a500" strokeWidth="2.5" strokeDasharray="9 6" strokeLinecap="round"
                  >
                    <animate attributeName="stroke-dashoffset" values="0;-30" dur="0.55s" repeatCount="indefinite" />
                  </line>
                  {/* Endpoint circle at destination */}
                  <circle cx={`${seg.x2}%`} cy={`${seg.y2}%`} r="5" fill="#f0a500" opacity="0.7" />
                  <circle cx={`${seg.x2}%`} cy={`${seg.y2}%`} r="3" fill="white" />
                </g>
              ))}
            </svg>

            {/* ── Cartoon avatar ─────────────────────────────────────────── */}
            {avatar && (
              <div
                style={{
                  position: "absolute",
                  left: `${avatar.x}%`,
                  top: `${avatar.y}%`,
                  transform: "translate(-50%, -75%)",
                  zIndex: 10,
                  pointerEvents: "none",
                  transition: avatar.moving
                    ? "left 0.78s cubic-bezier(0.45, 0, 0.55, 1), top 0.78s cubic-bezier(0.45, 0, 0.55, 1)"
                    : "none",
                  filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.45))",
                }}
              >
                <CartoonAvatar moving={avatar.moving} />
              </div>
            )}
          </div>

          {/* Week tracker row */}
          <div className="mt-3 bg-card border border-border p-2.5 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>🛒 {gs.tracker.groceryTier === "none" ? "Sem compras" : gs.tracker.groceryTier === "cheap" ? "Cesta básica ✓" : "Cesta completa ✓"}</span>
            <span>🍽️ Lanches: {gs.tracker.snackCount} | Refeições: {gs.tracker.mealCount}</span>
            <span>🚌 Viagens extras: {gs.tracker.transportTrips}</span>
            {gs.tracker.visitedPraca && <span>🌿 Parque ✓</span>}
          </div>

          <button onClick={advanceWeek} disabled={isMoving}
            className="mt-3 w-full py-3 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#1a5c38", color: "#f5f0e8" }}>
            {gs.week < 4 ? `📅 Encerrar Semana ${gs.week} →` : "🏁 Encerrar Semana 4 — Fim do mês!"}
          </button>
        </div>

        {/* Right panel */}
        <div className="md:w-72 border-l border-border flex flex-col" style={{ maxHeight: "calc(100vh - 116px)" }}>
          {/* Location actions */}
          <div className="p-3 border-b border-border flex-shrink-0" style={{ background: currentLocDef.tileColor }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{currentLocDef.emoji}</span>
              <p className="font-semibold text-sm" style={{ fontFamily: "Fraunces, serif" }}>{currentLocDef.name}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{currentLocDef.description}</p>
            {actions.length > 0 ? (
              <div className="space-y-1.5">
                {actions.map(a => (
                  <button key={a.id} onClick={() => a.id !== "_info" && doAction(a.id)}
                    disabled={isMoving || a.id === "_info" || (a.cost > 0 && gs.balance < a.cost)}
                    className="w-full text-left px-2.5 py-2 text-xs border transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                    style={{ background: "white", borderColor: currentLocDef.borderColor }}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="flex items-center gap-1.5 font-medium">{a.icon} {a.label}</span>
                      <span style={{ fontFamily: "DM Mono, monospace", color: "#1a5c38" }}>{a.cost === 0 ? "Grátis" : fmt(a.cost)}</span>
                    </div>
                    {a.note && <p className="text-muted-foreground" style={{ fontSize: 10 }}>{a.note}</p>}
                  </button>
                ))}
              </div>
            ) : gs.location === "casa" ? (
              <p className="text-xs text-muted-foreground italic">Clique em um local no mapa para se deslocar.</p>
            ) : gs.location === "trabalho" ? (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 p-2">
                Trabalho automático (5 dias/semana). Transporte descontado semanalmente.
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Sem ações disponíveis.</p>
            )}
          </div>

          {/* Bills */}
          <div className="p-3 border-b border-border flex-shrink-0">
            <p className="text-xs text-muted-foreground mb-2" style={{ fontFamily: "DM Mono, monospace" }}>CONTAS DO MÊS</p>
            <div className="space-y-1">
              {gs.bills.map(b => {
                const ov = !b.paid && b.dueWeek < gs.week;
                const now = !b.paid && b.dueWeek === gs.week;
                return (
                  <div key={b.id} className="flex justify-between items-start gap-1 text-xs">
                    <div className={b.paid ? "text-muted-foreground line-through" : ov ? "text-red-600 font-semibold" : now ? "text-orange-600 font-semibold" : ""}>
                      <span>{b.paid ? "✓" : ov ? "⚠️" : now ? "📄" : "🗓️"} {b.name}</span>
                      {!b.paid && <span className="block text-muted-foreground font-normal" style={{ fontSize: 10 }}>
                        {ov ? `atrasado (dia ${b.dueDay})` : `vence dia ${b.dueDay}`}
                      </span>}
                    </div>
                    <span style={{ fontFamily: "DM Mono, monospace", flexShrink: 0 }} className={b.paid ? "text-muted-foreground" : ov ? "text-red-600" : ""}>{fmt(b.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Log */}
          <div ref={logRef} className="flex-1 overflow-y-auto p-3 space-y-1">
            {gs.log.slice(-30).map(entry => (
              <div key={entry.id} className="text-xs flex items-start gap-1"
                style={{
                  color: entry.type === "expense" ? "#dc2626" : entry.type === "income" ? "#16a34a" : entry.type === "good" ? "#15803d" : entry.type === "warning" ? "#d97706" : entry.type === "system" ? "#6b7280" : "#374151",
                  fontFamily: entry.type === "system" ? "DM Mono, monospace" : undefined,
                  fontWeight: entry.type === "system" ? 600 : undefined,
                }}>
                {entry.type === "expense" && "−"}
                {entry.type === "income"  && "+"}
                {entry.type === "good"    && "✓"}
                {entry.type === "warning" && "⚠"}
                <span className="flex-1">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Week summary modal */}
      {showSummary && summaryDeltas && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border p-6 max-w-sm w-full">
            <h3 className="font-semibold text-lg mb-4" style={{ fontFamily: "Fraunces, serif" }}>
              Resumo — Semana {gs.week - 1}
            </h3>
            <div className="space-y-2 text-sm mb-5">
              {[
                { label: "Fome",    delta: summaryDeltas.h,      icon: "🍞" },
                { label: "Saúde",   delta: summaryDeltas.health, icon: "❤️" },
                { label: "Energia", delta: summaryDeltas.e,      icon: "⚡" },
              ].map(s => (
                <div key={s.label} className="flex justify-between items-center">
                  <span>{s.icon} {s.label}</span>
                  <span style={{ fontFamily: "DM Mono, monospace", color: s.delta >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                    {s.delta >= 0 ? "+" : ""}{s.delta.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
            {gs.needsDoctor && (
              <div className="bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
                ❤️ Saúde crítica! Vá ao Posto de Saúde esta semana.
              </div>
            )}
            <button onClick={() => setShowSummary(false)}
              className="w-full py-2.5 text-sm font-semibold hover:opacity-90"
              style={{ background: "#1a5c38", color: "#f5f0e8" }}>
              Continuar Semana {gs.week} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SimGameOverView ──────────────────────────────────────────────────────────
function SimGameOverView({ gs, config, onRestart, onQuit }: {
  gs: GameState; config: GameConfig; onRestart: () => void; onQuit: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "linear-gradient(160deg, #1a0a0a 0%, #3b0d0d 100%)" }}>
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-4">😔</div>
        <p className="text-xs tracking-widest mb-2" style={{ fontFamily: "DM Mono, monospace", color: "#f87171" }}>SIMULAÇÃO ENCERRADA</p>
        <h1 className="text-3xl font-semibold text-white mb-4" style={{ fontFamily: "Fraunces, serif" }}>Você não chegou ao fim do mês</h1>
        <div className="bg-white/10 border border-white/20 p-5 mb-4 text-left">
          <p className="text-sm text-red-200 mb-4"><strong className="text-red-300">Motivo:</strong> {gs.loseReason}</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              { label: "SEMANA",  val: `${gs.week} / 4` },
              { label: "SAÚDE",   val: `${gs.health}%` },
              { label: "SALDO",   val: fmt(gs.balance) },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-xs text-white/40 mb-0.5" style={{ fontFamily: "DM Mono, monospace" }}>{s.label}</p>
                <p className="text-white font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 mb-6 text-sm text-white/70 text-left">
          <p className="text-xs text-white/40 mb-2" style={{ fontFamily: "DM Mono, monospace" }}>REFLEXÃO</p>
          Esta simulação reflete a realidade de milhões de brasileiros: com o salário mínimo, qualquer desequilíbrio pode colapsar o orçamento inteiro.
        </div>
        <div className="flex gap-3">
          <button onClick={onRestart} className="flex-1 py-2.5 text-sm font-semibold" style={{ background: "#f0a500", color: "#1a1a1a" }}>Tentar novamente</button>
          <button onClick={onQuit} className="flex-1 py-2.5 text-sm border border-white/30 text-white hover:bg-white/10">Voltar</button>
        </div>
      </div>
    </div>
  );
}

// ─── SimSummaryView ───────────────────────────────────────────────────────────
function SimSummaryView({ gs, config, onQuit }: { gs: GameState; config: GameConfig; onQuit: () => void }) {
  const cats = Object.entries(gs.spentByCategory).sort((a, b) => b[1] - a[1]);
  const grade = gs.health > 65 && gs.balance > 150 ? "Excelente" : gs.health > 40 && gs.balance > 0 ? "Satisfatório" : "Difícil";
  const gradeColor = grade === "Excelente" ? "#22c55e" : grade === "Satisfatório" ? "#f0a500" : "#f87171";
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #0f2d1a 0%, #1a5c38 100%)" }}>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎉</div>
          <p className="text-xs tracking-widest mb-2" style={{ fontFamily: "DM Mono, monospace", color: "#f0a500" }}>FIM DE MÊS</p>
          <h1 className="text-4xl font-semibold text-white mb-2" style={{ fontFamily: "Fraunces, serif" }}>Você completou o mês!</h1>
          <p className="text-green-200">{MONTHS[config.month]} em {config.city}</p>
        </div>
        <div className="bg-white/10 border border-white/20 p-5 mb-4 text-center">
          <p className="text-xs text-white/50 mb-1" style={{ fontFamily: "DM Mono, monospace" }}>AVALIAÇÃO</p>
          <p className="text-3xl font-semibold mb-1" style={{ fontFamily: "Fraunces, serif", color: gradeColor }}>{grade}</p>
          <p className="text-white/70 text-sm">Saldo restante: <strong className="text-white">{fmt(gs.balance)}</strong></p>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { icon: "🍞", label: "Fome",    val: gs.hunger },
            { icon: "❤️", label: "Saúde",   val: gs.health },
            { icon: "⚡", label: "Energia", val: gs.energy },
          ].map(s => (
            <div key={s.label} className="bg-white/10 border border-white/20 p-4 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-xl font-semibold" style={{ fontFamily: "Fraunces, serif", color: statColor(s.val) }}>{s.val}%</div>
              <div className="text-xs text-white/50">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white/10 border border-white/20 p-4">
            <p className="text-xs text-white/50 mb-3" style={{ fontFamily: "DM Mono, monospace" }}>RESUMO FINANCEIRO</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-green-200">Salário recebido</span><span className="text-white">{fmt(config.netSalary)}</span></div>
              <div className="flex justify-between"><span className="text-red-200">Total gasto</span><span className="text-white">−{fmt(gs.totalSpent)}</span></div>
              <div className="border-t border-white/20 pt-1.5 flex justify-between font-semibold">
                <span className="text-white">Saldo final</span><span style={{ color: gradeColor }}>{fmt(gs.balance)}</span>
              </div>
            </div>
          </div>
          <div className="bg-white/10 border border-white/20 p-4">
            <p className="text-xs text-white/50 mb-3" style={{ fontFamily: "DM Mono, monospace" }}>GASTOS POR CATEGORIA</p>
            <div className="space-y-2">
              {cats.map(([cat, val]) => (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-white/70">{cat}</span>
                    <span className="text-white" style={{ fontFamily: "DM Mono, monospace" }}>{fmt(val)}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(val / gs.totalSpent) * 100}%`, background: cat === "Alimentação" ? "#f0a500" : cat === "Transporte" ? "#60a5fa" : cat === "Contas" ? "#a78bfa" : cat === "Moradia" ? "#f97316" : "#34d399" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-5 mb-6">
          <p className="text-xs text-white/40 mb-2" style={{ fontFamily: "DM Mono, monospace" }}>CONTEXTO EDUCACIONAL</p>
          <p className="text-sm text-white/80">
            {gs.balance > 150
              ? `Parabéns! Você fechou o mês com ${fmt(gs.balance)} de margem em ${config.city}. Isso exige disciplina real — qualquer imprevisto poderia mudar tudo.`
              : `Você sobreviveu, mas no limite. Com ${fmt(gs.balance)} restantes, um único imprevisto derrubaria seu orçamento — realidade de milhões de brasileiros.`}
          </p>
        </div>
        <button onClick={onQuit} className="w-full py-3 text-sm font-semibold hover:opacity-90" style={{ background: "#f0a500", color: "#1a1a1a" }}>
          Voltar à plataforma
        </button>
      </div>
    </div>
  );
}
