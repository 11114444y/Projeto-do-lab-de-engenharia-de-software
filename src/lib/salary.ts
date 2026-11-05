/** Projeção mensal simplificada de vínculo CLT (sem dependentes ou outras deduções).
 * Fontes oficiais e competência: janeiro/2026.
 * https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
 * https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026
 */
export const SALARY_TABLE_YEAR = 2026;
const cent = (n: number) => Math.round((n + 1e-8) * 100) / 100;
export function calculateSalary(gross: number) {
  if (!Number.isFinite(gross) || gross < 0) throw new Error("Salário bruto inválido");
  const limits = [[1621,0.075],[2902.84,0.09],[4354.27,0.12],[8475.55,0.14]];
  let inss = 0, lower = 0;
  for (const [upper, rate] of limits) {
    inss += Math.max(0, Math.min(gross, upper)-lower)*rate;
    lower=upper;
    if(gross<=upper)break;
  }
  inss=cent(inss);
  const simplifiedDeduction = 607.20;
  const base=Math.max(0,gross-Math.max(inss,simplifiedDeduction));
  let tax=0;
  if(base>4664.68)tax=base*.275-908.73;
  else if(base>3751.05)tax=base*.225-675.49;
  else if(base>2826.65)tax=base*.15-394.16;
  else if(base>2428.80)tax=base*.075-182.16;
  tax=Math.max(0,cent(tax));
  let reduction=0;
  if(gross<=5000)reduction=Math.min(tax,312.89);
  else if(gross<=7350)reduction=Math.min(tax,Math.max(0,978.62-0.133145*gross));
  const irrf=cent(Math.max(0,tax-reduction));
  const fgts=cent(gross*.08); // encargo do empregador, não desconto do empregado
  const net=cent(gross-inss-irrf);
  return {inss,irrf,fgts,net,base:cent(base)};
}
