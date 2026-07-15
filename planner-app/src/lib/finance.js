// Conversões e regras de rentabilidade

export const annualToMonthly = (annual) => Math.pow(1 + annual, 1 / 12) - 1;
export const monthlyToAnnual = (monthly) => Math.pow(1 + monthly, 12) - 1;

export const INVESTMENT_TYPES = {
  CDI_PCT: 'CDI_PCT',
  SELIC_PCT: 'SELIC_PCT',
  IPCA_PLUS: 'IPCA_PLUS',
  PREFIXADO: 'PREFIXADO',
  POUPANCA: 'POUPANCA',
};

export const INVESTMENT_TYPE_LABELS = {
  [INVESTMENT_TYPES.CDI_PCT]: '% do CDI',
  [INVESTMENT_TYPES.SELIC_PCT]: '% da Selic',
  [INVESTMENT_TYPES.IPCA_PLUS]: 'IPCA+',
  [INVESTMENT_TYPES.PREFIXADO]: 'Prefixado',
  [INVESTMENT_TYPES.POUPANCA]: 'Poupança',
};

// Taxa padrão de reinvestimento: IPCA + 5% a.a. - usada quando um investimento
// vence (ver monthlyReturnRate) e como taxa inicial de um investimento novo
// ainda não configurado (ver InvestmentsPanel).
export const DEFAULT_REINVEST_SPREAD_ANNUAL = 0.05;

export function defaultReinvestRate(indices) {
  return (1 + indices.ipca) * (1 + annualToMonthly(DEFAULT_REINVEST_SPREAD_ANNUAL)) - 1;
}

// indices = { ipca, cdi, selic } monthly decimal rates (e.g. 0.0090 = 0.90% a.m.)
// rateParam meaning depends on type - see INVESTMENT_TYPE_LABELS / UI hints
// `date` (opcional) é o mês da simulação sendo calculado. Se o investimento tiver
// `maturityDate` e esse mês já passou do vencimento, ignora a taxa contratada e
// usa o padrão de reinvestimento (IPCA + 5% a.a.) - assim o rendimento não
// continua "pra sempre" na taxa contratada depois que o título já venceu.
export function monthlyReturnRate(investment, indices, date) {
  const { type, rateParam, maturityDate } = investment;
  if (maturityDate && date && date > parseISODate(maturityDate)) {
    return defaultReinvestRate(indices);
  }
  switch (type) {
    case INVESTMENT_TYPES.CDI_PCT:
      return indices.cdi * rateParam;
    case INVESTMENT_TYPES.SELIC_PCT:
      return indices.selic * rateParam;
    case INVESTMENT_TYPES.IPCA_PLUS: {
      const spreadMonthly = annualToMonthly(rateParam);
      return (1 + indices.ipca) * (1 + spreadMonthly) - 1;
    }
    case INVESTMENT_TYPES.PREFIXADO:
      return annualToMonthly(rateParam);
    case INVESTMENT_TYPES.POUPANCA: {
      const selicAnnual = monthlyToAnnual(indices.selic);
      if (selicAnnual > 0.085) return 0.005; // 0.5% a.m. (TR ~ 0)
      return 0.7 * indices.selic;
    }
    default:
      return 0;
  }
}

// Tabela regressiva de IR pra renda fixa no Brasil - incide só sobre o ganho,
// nunca sobre o principal. Investimentos isentos (poupança, LCI/LCA/CRI/CRA
// marcados como `taxExempt`) não pagam nada.
export function incomeTaxRate(ageDays) {
  if (ageDays <= 180) return 0.225;
  if (ageDays <= 360) return 0.20;
  if (ageDays <= 720) return 0.175;
  return 0.15;
}

export function formatBRL(value) {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function formatBRLPrecise(value) {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}

export function formatPct(value, digits = 2) {
  if (!Number.isFinite(value)) return '-';
  return `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  return d;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

// Nº do mês de simulação (1-indexado, igual a projection.js) em que `date` cai,
// contando a partir de `startDate`.
export function monthIndexFor(startDate, date) {
  return (date.getFullYear() - startDate.getFullYear()) * 12 + (date.getMonth() - startDate.getMonth()) + 1;
}
