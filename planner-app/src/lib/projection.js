import { annualToMonthly, monthlyReturnRate, incomeTaxRate, monthKey, addMonths, parseISODate } from './finance';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Retorna os índices (mensais, decimais) para um mês: usa dado real se existir,
// senão cai para a média assumida.
function getIndicesForMonth(date, settings, realData) {
  const key = monthKey(date);
  const real = realData?.[key];
  const assumed = {
    ipca: annualToMonthly(settings.assumedInflationAnnual),
    cdi: annualToMonthly(settings.assumedCdiAnnual),
    selic: annualToMonthly(settings.assumedSelicAnnual),
  };
  if (real && (real.ipca != null || real.cdi != null || real.selic != null)) {
    return {
      ipca: real.ipca ?? assumed.ipca,
      cdi: real.cdi ?? assumed.cdi,
      selic: real.selic ?? assumed.selic,
      isReal: true,
      partial: real.ipca == null || real.cdi == null || real.selic == null,
    };
  }
  return { ...assumed, isReal: false, partial: false };
}

// Agrupa os aportes registrados (lançamentos manuais) por mês e investimento.
function indexContributions(contributions) {
  const idx = {};
  (contributions || []).forEach((c) => {
    const key = monthKey(parseISODate(c.date));
    if (!idx[key]) idx[key] = {};
    idx[key][c.investmentId] = (idx[key][c.investmentId] || 0) + (Number(c.amount) || 0);
  });
  return idx;
}

// Simula a carteira mês a mês.
//
// mode 'plan' (padrão): usa o aporte teórico (cresce com inflação + crescimento
//   real definidos em Parâmetros) e o distribui proporcionalmente ao saldo já
//   investido em cada aplicação - é a linha "Projetado", o plano original.
// mode 'actual': para meses já vividos (até `todayMonthIndex`), usa somente os
//   aportes que você registrou manualmente (data + valor) em cada investimento
//   - mês sem lançamento não recebe aporte novo. Para meses futuros, cai de
//   volta no aporte teórico (mesma regra do modo 'plan'), já que ainda não
//   aconteceram e não há o que registrar.
//
// realData (opcional): { "2026-07": { ipca, cdi, selic }, ... } - quando fornecido,
// meses com dado real usam o valor real de IPCA/CDI/Selic; os demais usam a média assumida.
//
// Taxa de custódia/administração (`custodyFeeAnnual`, ex: 0,20% a.a. da B3 no
// Tesouro Direto) é descontada direto da taxa de rendimento mensal, todo mês -
// diferente do IR, ela é um custo real que sai do saldo mesmo sem resgate.
//
// IR: estimado sobre o ganho (saldo - total aportado) de cada investimento,
// pela tabela regressiva, usando a idade média ponderada pelos valores
// aportados como aproximação do tempo de aplicação (sem rastrear cada aporte
// individualmente). Investimentos com `taxExempt` (poupança, LCI/LCA...) não
// pagam nada. `realBalance` (base da meta) já sai líquida de IR e de inflação.
export function simulate(settings, investments, { realData = null, contributions = null, mode = 'plan', todayMonthIndex = Infinity } = {}) {
  const startDate = parseISODate(settings.startDate);
  const months = settings.horizonYears * 12;
  const nominalGrowthMonthly = ((1 + settings.assumedInflationAnnual) * (1 + settings.contributionRealGrowthAnnual)) ** (1 / 12) - 1;
  const contribByMonth = mode === 'actual' ? indexContributions(contributions) : null;

  // Todo saldo entra via aporte registrado (inclusive o valor "inicial") - a
  // carteira sempre começa zerada e cresce só pelos aportes + rendimentos.
  const invBalances = investments.map(() => 0);
  const costBasis = investments.map(() => 0); // total aportado (sem rendimento) por investimento
  const weightedTimeSum = investments.map(() => 0); // soma(valor_aporte * timestamp) p/ idade média ponderada
  let cumInflation = 1;
  let cumContribution = 0;

  const rows = [];

  for (let m = 1; m <= months; m++) {
    const date = addMonths(startDate, m - 1);
    const indices = getIndicesForMonth(date, settings, realData);
    const plannedContribution = settings.monthlyContribution * Math.pow(1 + nominalGrowthMonthly, m - 1);

    let contributionShares;
    if (mode === 'actual' && m <= todayMonthIndex) {
      const logged = contribByMonth[monthKey(date)] || {};
      contributionShares = investments.map((inv) => logged[inv.id] || 0);
    } else {
      const total = invBalances.reduce((a, b) => a + b, 0);
      contributionShares = total > 0
        ? invBalances.map((b) => (b / total) * plannedContribution)
        : investments.map(() => plannedContribution / (investments.length || 1));
    }

    let monthInterest = 0;
    let nominalTotal = 0;
    let netTotal = 0;
    const taxByInvestment = investments.map(() => 0);
    investments.forEach((inv, i) => {
      const grossRate = monthlyReturnRate(inv, indices, date);
      const feeMonthly = inv.custodyFeeAnnual ? annualToMonthly(inv.custodyFeeAnnual) : 0;
      const rate = grossRate - feeMonthly;
      const interest = invBalances[i] * rate;
      const balanceBeforeFlow = invBalances[i] + interest;
      invBalances[i] = balanceBeforeFlow + contributionShares[i];
      monthInterest += interest;

      if (contributionShares[i] > 0) {
        weightedTimeSum[i] += contributionShares[i] * date.getTime();
        costBasis[i] += contributionShares[i];
      } else if (contributionShares[i] < 0 && balanceBeforeFlow > 0) {
        // Saque: reduz a base de custo e a idade média ponderada na mesma
        // proporção do saldo retirado (aproximação pro-rata - não rastreamos
        // aporte a aporte individualmente, então um saque "leva junto" uma
        // fatia proporcional de custo e de tempo de todos os aportes já feitos).
        const keptFraction = Math.max(0, 1 + contributionShares[i] / balanceBeforeFlow);
        costBasis[i] *= keptFraction;
        weightedTimeSum[i] *= keptFraction;
      }

      const gain = invBalances[i] - costBasis[i];
      let tax = 0;
      if (gain > 0 && !inv.taxExempt) {
        const avgPurchaseTime = costBasis[i] > 0 ? weightedTimeSum[i] / costBasis[i] : date.getTime();
        const ageDays = Math.max(0, (date.getTime() - avgPurchaseTime) / MS_PER_DAY);
        tax = gain * incomeTaxRate(ageDays);
      }
      taxByInvestment[i] = tax;

      nominalTotal += invBalances[i];
      netTotal += invBalances[i] - tax;
    });

    const monthContribution = contributionShares.reduce((a, b) => a + b, 0);
    cumContribution += monthContribution;
    cumInflation *= 1 + indices.ipca;

    const realTotal = netTotal / cumInflation;

    rows.push({
      month: m,
      date,
      year: date.getFullYear(),
      contribution: monthContribution,
      plannedContribution,
      interest: monthInterest,
      nominalBalance: nominalTotal,
      netBalance: netTotal,
      realBalance: realTotal,
      cumContribution,
      cumInterest: nominalTotal - cumContribution,
      taxPaid: nominalTotal - netTotal,
      pctOfGoal: realTotal / settings.goal,
      isReal: indices.isReal,
      partial: indices.partial,
      ipca: indices.ipca,
      cdi: indices.cdi,
      selic: indices.selic,
      perInvestment: investments.map((inv, i) => ({
        id: inv.id,
        balance: invBalances[i],
        netBalance: invBalances[i] - taxByInvestment[i],
      })),
    });
  }

  const goalNominal = rows.find((r) => r.nominalBalance >= settings.goal) || null;
  const goalReal = rows.find((r) => r.realBalance >= settings.goal) || null;

  return { rows, goalNominal, goalReal };
}

export function monthsToYearsLabel(m) {
  if (m == null) return 'Não atingido no horizonte simulado';
  const years = Math.floor((m - 1) / 12);
  const rem = (m - 1) % 12;
  return `${years} ano${years === 1 ? '' : 's'} e ${rem} ${rem === 1 ? 'mês' : 'meses'}`;
}

// Tempo que falta a partir de hoje (não desde o início do plano) pra bater a
// meta - `targetMonth` é o mês (1-indexado) em que a meta foi batida na
// simulação, `currentMonthIndex` é o mês correspondente a hoje.
export function remainingTimeLabel(targetMonth, currentMonthIndex) {
  if (targetMonth == null) return 'Não atingida no horizonte simulado';
  const remaining = targetMonth - currentMonthIndex;
  if (remaining <= 0) return 'Meta já atingida';
  const years = Math.floor(remaining / 12);
  const rem = remaining % 12;
  return `${years} ano${years === 1 ? '' : 's'} e ${rem} ${rem === 1 ? 'mês' : 'meses'}`;
}
