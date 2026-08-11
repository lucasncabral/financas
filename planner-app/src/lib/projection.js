import { annualToMonthly, monthlyReturnRate, defaultReinvestRate, incomeTaxRate, monthKey, addMonths, parseISODate, daysInMonth } from './finance';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Retorna os índices (mensais, decimais) para um mês: usa dado real se existir,
// senão cai para a média assumida.
export function getIndicesForMonth(date, settings, realData) {
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
// Guarda tanto o total do mês (usado pro saldo/base de custo) quanto o dia
// exato de cada lançamento (usado pro rendimento pro-rata - ver simulate()).
function indexContributions(contributions) {
  const idx = {};
  (contributions || []).forEach((c) => {
    const date = parseISODate(c.date);
    const key = monthKey(date);
    const amount = Number(c.amount) || 0;
    if (!idx[key]) idx[key] = {};
    if (!idx[key][c.investmentId]) idx[key][c.investmentId] = { total: 0, events: [] };
    idx[key][c.investmentId].total += amount;
    idx[key][c.investmentId].events.push({ day: date.getDate(), amount });
  });
  return idx;
}

// Simula a carteira mês a mês.
//
// mode 'plan' (padrão): usa o aporte teórico (cresce com o IPCA + o crescimento
//   real definido em Parâmetros) - é a linha "Projetado", o plano original.
//   Esse aporte não pertence a nenhum investimento específico (não faz sentido
//   assumir por décadas a taxa de um produto que você tem hoje, tipo uma
//   oferta promocional de banco) - ele é simulado como uma única aplicação
//   genérica rendendo a taxa padrão de reinvestimento (IPCA + 5% a.a., a
//   mesma usada em `defaultReinvestRate` quando um título vence sem taxa
//   contratada), tributada pela tabela regressiva normal.
// mode 'actual': para meses já vividos (até `todayMonthIndex`), usa somente os
//   aportes que você registrou manualmente (data + valor) em cada investimento
//   - mês sem lançamento não recebe aporte novo. Cada lançamento rende
//   pro-rata pelo dia exato em que entrou (ou saiu, no caso de saque) dentro
//   do mês - ver o cálculo de `interest` no loop de investimentos. Os
//   investimentos já cadastrados continuam rendendo a taxa própria deles pra
//   sempre (não somem, não consolidam) - só não recebem mais nenhum aporte
//   novo depois de `todayMonthIndex`. Todo aporte teórico futuro (que ainda
//   não existe de verdade) vai pra uma aplicação genérica separada
//   (`__generic_future__`), rendendo IPCA+5% - já que não faz sentido supor
//   que um aporte que você ainda nem fez vai cair num produto específico que
//   você tem hoje.
// mode 'hybrid' ("Projetado ajustado" na UI): igual ao 'actual' até
//   `todayMonthIndex` (mesmos aportes reais, nos mesmos investimentos, com as
//   taxas reais deles). No mês seguinte a hoje, o saldo (e a base de custo/
//   idade média, pro IR) de todos os investimentos reais é consolidado numa
//   única aplicação genérica (`__generic_future__`) - as taxas contratadas de
//   cada investimento deixam de valer a partir daí. Dali pra frente, só essa
//   aplicação genérica existe: cresce a IPCA+5% (igual o modo 'plan') e
//   recebe todo aporte teórico futuro. Diferença pro 'actual': lá o saldo já
//   investido continua rendendo a taxa própria de cada investimento pra
//   sempre; aqui ele também vira genérico a partir de hoje.
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
// pagam nada. `realBalance` (base da meta) já sai líquida de IR e de inflação;
// `realBalanceGross` é o mesmo valor de hoje (já descontada a inflação), mas
// sem descontar o IR estimado - útil pra quem quer acompanhar a meta sem
// entrar no mérito de quanto viraria imposto.
export function simulate(settings, investments, { realData = null, contributions = null, mode = 'plan', todayMonthIndex = Infinity } = {}) {
  const startDate = parseISODate(settings.startDate);
  const months = settings.horizonYears * 12;
  const realGrowthMonthly = annualToMonthly(settings.contributionRealGrowthAnnual);
  const contribByMonth = (mode === 'actual' || mode === 'hybrid') ? indexContributions(contributions) : null;

  // No modo 'plan' simulamos uma única aplicação genérica (ver comentário
  // acima) em vez dos investimentos cadastrados. Nos modos 'actual' e
  // 'hybrid' mantemos os investimentos reais (pro trecho já vivido) e
  // acrescentamos essa mesma aplicação genérica só pra receber o aporte
  // teórico futuro - a diferença entre os dois é só se o saldo já investido
  // consolida pra genérico também ('hybrid') ou não ('actual').
  const simInvestments = mode === 'plan'
    ? [{ id: 'generic-plan', isGeneric: true }]
    : (mode === 'hybrid' || mode === 'actual')
      ? [...investments, { id: '__generic_future__', isGeneric: true }]
      : investments;

  // Todo saldo entra via aporte registrado (inclusive o valor "inicial") - a
  // carteira sempre começa zerada e cresce só pelos aportes + rendimentos.
  const invBalances = simInvestments.map(() => 0);
  const costBasis = simInvestments.map(() => 0); // total aportado (sem rendimento) por investimento
  const weightedTimeSum = simInvestments.map(() => 0); // soma(valor_aporte * timestamp) p/ idade média ponderada
  let cumInflation = 1;
  let cumContribution = 0;
  // IPCA acumulado que corrige o aporte - ver `plannedContribution` no loop.
  let contributionInflation = 1;

  const rows = [];

  for (let m = 1; m <= months; m++) {
    const date = addMonths(startDate, m - 1);
    const indices = getIndicesForMonth(date, settings, realData);
    // Aporte teórico do mês: corrigido pelo IPCA acumulado até o mês anterior
    // mais o crescimento real. Sem defasagem de divulgação - o mês que ainda
    // não tem IPCA lançado entra pela inflação assumida (`getIndicesForMonth`),
    // e passa a usar o número real assim que ele for registrado. Assim o plano
    // fica neutro a IPCA em termos reais: o aporte e o rendimento da aplicação
    // genérica (IPCA + 5% a.a.) sobem juntos com a inflação, então revisar um
    // mês de IPCA não antecipa nem atrasa a data em que a meta é batida.
    const plannedContribution = settings.monthlyContribution * contributionInflation * Math.pow(1 + realGrowthMonthly, m - 1);

    if (mode === 'hybrid' && m === todayMonthIndex + 1) {
      // Consolidação única: tudo que os investimentos reais têm acumulado até
      // aqui (saldo, base de custo, idade média ponderada) migra pra
      // aplicação genérica, e eles zeram - a partir deste mês só ela existe.
      const genericIndex = simInvestments.findIndex((inv) => inv.isGeneric);
      simInvestments.forEach((inv, i) => {
        if (inv.isGeneric) return;
        invBalances[genericIndex] += invBalances[i];
        costBasis[genericIndex] += costBasis[i];
        weightedTimeSum[genericIndex] += weightedTimeSum[i];
        invBalances[i] = 0;
        costBasis[i] = 0;
        weightedTimeSum[i] = 0;
      });
    }

    let contributionShares;
    let flowEvents = null; // eventos com dia exato (só existem nos modos 'actual'/'hybrid', no trecho já vivido) - ver rendimento pro-rata abaixo
    if ((mode === 'actual' || mode === 'hybrid') && m <= todayMonthIndex) {
      const logged = contribByMonth[monthKey(date)] || {};
      contributionShares = simInvestments.map((inv) => logged[inv.id]?.total || 0);
      flowEvents = simInvestments.map((inv) => logged[inv.id]?.events || []);
    } else if (mode === 'hybrid' || mode === 'actual') {
      // Futuro nos modos 'hybrid'/'actual': nenhum aporte novo pros
      // investimentos reais - tudo vai pra aplicação genérica (ver comentário
      // de simInvestments acima).
      contributionShares = simInvestments.map((inv) => (inv.isGeneric ? plannedContribution : 0));
    } else {
      const total = invBalances.reduce((a, b) => a + b, 0);
      contributionShares = total > 0
        ? invBalances.map((b) => (b / total) * plannedContribution)
        : simInvestments.map(() => plannedContribution / (simInvestments.length || 1));
    }
    const dim = daysInMonth(date);

    let monthInterest = 0;
    let monthInvestedBase = 0;
    let nominalTotal = 0;
    let netTotal = 0;
    const taxByInvestment = simInvestments.map(() => 0);
    simInvestments.forEach((inv, i) => {
      const grossRate = inv.isGeneric ? defaultReinvestRate(indices) : monthlyReturnRate(inv, indices, date);
      const feeMonthly = inv.custodyFeeAnnual ? annualToMonthly(inv.custodyFeeAnnual) : 0;
      const rate = grossRate - feeMonthly;
      let interest = invBalances[i] * rate;
      // Pro-rata: cada lançamento (aporte ou saque) do mês só rende pela fração
      // do mês em que o dinheiro esteve de fato na carteira. Um aporte no dia D
      // rende (diasDoMês - D + 1)/diasDoMês desse mês; um saque no dia D "devolve"
      // proporcionalmente os juros do saldo cheio que já tinham sido creditados
      // pra ele em `invBalances[i] * rate` acima (mesma fórmula, valor negativo).
      let weightedFlow = 0;
      (flowEvents?.[i] || []).forEach(({ day, amount }) => {
        const fractionRemaining = (dim - day + 1) / dim;
        interest += amount * rate * fractionRemaining;
        weightedFlow += amount * fractionRemaining;
      });
      // Capital que de fato ficou aplicado no mês: saldo de abertura mais cada
      // lançamento pesado pela fração do mês em que esteve na carteira - é
      // exatamente o valor que, multiplicado pela taxa, dá o `interest` acima.
      // Serve de denominador pra medir a rentabilidade realizada sem que um
      // aporte grande no meio do mês apareça como rendimento extra.
      monthInvestedBase += invBalances[i] + weightedFlow;
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
    contributionInflation *= 1 + indices.ipca;

    const realTotal = netTotal / cumInflation;
    const realTotalGross = nominalTotal / cumInflation; // valor de hoje, mas sem descontar IR

    rows.push({
      month: m,
      date,
      year: date.getFullYear(),
      contribution: monthContribution,
      plannedContribution,
      interest: monthInterest,
      investedBase: monthInvestedBase,
      nominalBalance: nominalTotal,
      netBalance: netTotal,
      realBalance: realTotal,
      realBalanceGross: realTotalGross,
      cumContribution,
      cumInterest: nominalTotal - cumContribution,
      taxPaid: nominalTotal - netTotal,
      cumInflation,
      pctOfGoal: realTotal / settings.goal,
      pctOfGoalGross: realTotalGross / settings.goal,
      isReal: indices.isReal,
      partial: indices.partial,
      ipca: indices.ipca,
      cdi: indices.cdi,
      selic: indices.selic,
      perInvestment: simInvestments.map((inv, i) => ({
        id: inv.id,
        balance: invBalances[i],
        netBalance: invBalances[i] - taxByInvestment[i],
      })),
    });
  }

  const goalNominal = rows.find((r) => r.nominalBalance >= settings.goal) || null;
  const goalReal = rows.find((r) => r.realBalance >= settings.goal) || null;
  const goalRealGross = rows.find((r) => r.realBalanceGross >= settings.goal) || null;

  return { rows, goalNominal, goalReal, goalRealGross };
}

// Mês em que o saldo bruto (nominal) alcança o equivalente - corrigido pela
// inflação acumulada até ali - da meta declarada "em valor de {baseYear}".
// Ex: com 5% de inflação a.a., R$3.000.000 daqui a 20 anos só valem o que
// ~R$1.100.000 valem hoje, então bater literalmente R$3.000.000 nominais não
// é "bater a meta" de verdade. Usado só pra marcar a bolinha no gráfico
// "Saldo nominal" - não mexe em `goalNominal` (usado no card "Meta atingida
// (saldo nominal)"), que de propósito compara contra o número fixo da meta.
export function findInflationAdjustedGoalMonth(rows, goal) {
  const row = rows.find((r) => r.nominalBalance >= goal * r.cumInflation);
  return row?.month ?? null;
}
