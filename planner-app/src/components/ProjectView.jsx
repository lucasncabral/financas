import { useEffect, useMemo, useRef, useState } from 'react';
import { loadProjectData, saveProjectData, exportJSON, importJSON, sanitizeFilename } from '../lib/storage';
import { simulate, findInflationAdjustedGoalMonth, getIndicesForMonth } from '../lib/projection';
import { fetchRealData } from '../lib/bcb';
import { monthIndexFor, parseISODate, monthlyReturnRate, annualToMonthly, daysInMonth } from '../lib/finance';
import { getProjectMeta, renameProject } from '../lib/projects';
import SettingsPanel from './SettingsPanel';
import InvestmentsPanel from './InvestmentsPanel';
import SummaryCards from './SummaryCards';
import ProjectionChart from './ProjectionChart';
import ProjectionTable from './ProjectionTable';
import DistributionChart from './DistributionChart';

const TABS = ['Resumo', 'Parâmetros', 'Investimentos', 'Distribuição', 'Projeção'];

export default function ProjectView({ projectId, onBack }) {
  const [data, setData] = useState(() => loadProjectData(projectId));
  const [projectName, setProjectName] = useState(() => getProjectMeta(projectId)?.name || 'Projeto');
  const [editingName, setEditingName] = useState(false);
  const [tab, setTab] = useState('Resumo');
  const [fetchStatus, setFetchStatus] = useState(null);
  const [fetching, setFetching] = useState(false);
  const fileInputRef = useRef(null);

  // Trocar de projeto (via navegação) recarrega os dados desse projeto do zero.
  useEffect(() => {
    setData(loadProjectData(projectId));
    setProjectName(getProjectMeta(projectId)?.name || 'Projeto');
    setTab('Resumo');
  }, [projectId]);

  useEffect(() => {
    saveProjectData(projectId, data);
  }, [projectId, data]);

  const commitName = (name) => {
    const trimmed = name.trim();
    if (trimmed) {
      renameProject(projectId, trimmed);
      setProjectName(trimmed);
    }
    setEditingName(false);
  };

  const baseYear = useMemo(() => parseISODate(data.settings.startDate).getFullYear(), [data.settings.startDate]);

  // Mês (1-indexado) em que "hoje" cai dentro da simulação - meses até aqui já
  // aconteceram (usam os aportes registrados); dali pra frente ainda é plano.
  const currentMonthIndex = useMemo(
    () => monthIndexFor(parseISODate(data.settings.startDate), new Date()),
    [data.settings.startDate]
  );

  // Investimentos ocultos (olho fechado) ficam de fora da Projeção/Resumo -
  // útil pra isolar um investimento específico e comparar com o extrato real.
  const visibleInvestments = useMemo(
    () => data.investments.filter((inv) => !inv.hidden),
    [data.investments]
  );

  const projectionResult = useMemo(
    () => simulate(data.settings, visibleInvestments, { mode: 'plan' }),
    [data.settings, visibleInvestments]
  );
  const realResult = useMemo(
    () => simulate(data.settings, visibleInvestments, {
      realData: data.realData,
      contributions: data.contributions,
      mode: 'actual',
      todayMonthIndex: currentMonthIndex,
    }),
    [data.settings, visibleInvestments, data.realData, data.contributions, currentMonthIndex]
  );
  // "Projetado ajustado": real até hoje (mesmos aportes/investimentos da linha Real),
  // e daqui pra frente projeta como aplicação genérica IPCA+5% (mesma taxa do
  // modo 'plan') em vez de continuar nos investimentos cadastrados - ver
  // mode 'hybrid' em projection.js.
  const hybridResult = useMemo(
    () => simulate(data.settings, visibleInvestments, {
      realData: data.realData,
      contributions: data.contributions,
      mode: 'hybrid',
      todayMonthIndex: currentMonthIndex,
    }),
    [data.settings, visibleInvestments, data.realData, data.contributions, currentMonthIndex]
  );

  // Saldo líquido (já descontado o IR estimado) e bruto por investimento até o
  // fechamento do mês atual na simulação (inclui ocultos). Dentro do mês em
  // que entra, um aporte rende pro-rata pelo dia exato do lançamento (e um
  // saque só deixa de render a partir do dia em que saiu) - ver `simulate()`
  // em projection.js. O saldo bruto é usado pra converter um saque (informado
  // em valor líquido) no aporte negativo equivalente - ver InvestmentsPanel.
  const { currentBalanceByInvestment, grossBalanceByInvestment } = useMemo(() => {
    const result = simulate(data.settings, data.investments, {
      realData: data.realData,
      contributions: data.contributions,
      mode: 'actual',
      todayMonthIndex: currentMonthIndex,
    });
    const idx = Math.min(Math.max(currentMonthIndex, 1), result.rows.length) - 1;
    const net = {};
    const gross = {};
    (result.rows[idx]?.perInvestment || []).forEach((p) => { net[p.id] = p.netBalance; gross[p.id] = p.balance; });
    return { currentBalanceByInvestment: net, grossBalanceByInvestment: gross };
  }, [data.settings, data.investments, data.realData, data.contributions, currentMonthIndex]);

  // Valor de saque que precisa ser registrado hoje pra zerar cada investimento
  // de verdade (saldo final = 0), não `grossBalanceByInvestment` puro. Esse
  // saldo bruto é o saldo de *fechamento do mês* (a simulação é mensal); um
  // saque datado de hoje, se hoje não for o último dia do mês, recebe o mesmo
  // ajuste pro-rata que qualquer lançamento (rende só a fração do mês que
  // falta) - sacar exatamente o saldo bruto sobra um resíduo (positivo ou
  // negativo) do tamanho desse ajuste. Resolvendo pra saldo final = 0:
  // valor = saldoBruto / (1 + taxaMensal * fraçãoRestanteDoMês).
  const zeroAmountByInvestment = useMemo(() => {
    const today = new Date();
    const dim = daysInMonth(today);
    const fractionRemaining = (dim - today.getDate() + 1) / dim;
    const indices = getIndicesForMonth(today, data.settings, data.realData);
    const amounts = {};
    data.investments.forEach((inv) => {
      const gross = grossBalanceByInvestment[inv.id] || 0;
      if (gross <= 0) { amounts[inv.id] = 0; return; }
      const grossRate = monthlyReturnRate(inv, indices, today);
      const feeMonthly = inv.custodyFeeAnnual ? annualToMonthly(inv.custodyFeeAnnual) : 0;
      const rate = grossRate - feeMonthly;
      amounts[inv.id] = gross / (1 + rate * fractionRemaining);
    });
    return amounts;
  }, [data.settings, data.investments, data.realData, grossBalanceByInvestment]);

  const chartData = useMemo(() => {
    return projectionResult.rows.map((r, i) => {
      const realRow = realResult.rows[i];
      const hybridRow = hybridResult.rows[i];
      return {
        month: r.month,
        label: r.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        projNominal: r.nominalBalance,
        projReal: r.realBalance,
        projSemIR: r.realBalanceGross,
        realNominal: realRow.nominalBalance,
        realReal: realRow.realBalance,
        realSemIR: realRow.realBalanceGross,
        proj2Nominal: hybridRow.nominalBalance,
        proj2Real: hybridRow.realBalance,
        proj2SemIR: hybridRow.realBalanceGross,
      };
    });
  }, [projectionResult, realResult, hybridResult]);

  // Mês (1-indexado) em que cada linha bate a meta, pra marcar a bolinha nos
  // gráficos - um valor por linha, um conjunto pro gráfico nominal e outro
  // pro gráfico líquido de IR/inflação (metas diferentes: nominalBalance vs realBalance).
  // No gráfico nominal, a bolinha usa o equivalente corrigido pela inflação
  // acumulada (não o `goalNominal` cru usado no card "Meta atingida (saldo
  // nominal)"), senão ela marcaria o saldo batendo R$ 3.000.000 nominais
  // fixos, que não é o mesmo que bater a meta declarada em valor de hoje.
  const goalMonthsNominal = useMemo(() => ({
    proj: findInflationAdjustedGoalMonth(projectionResult.rows, data.settings.goal),
    real: findInflationAdjustedGoalMonth(realResult.rows, data.settings.goal),
    proj2: findInflationAdjustedGoalMonth(hybridResult.rows, data.settings.goal),
  }), [projectionResult, realResult, hybridResult, data.settings.goal]);
  const goalMonthsReal = useMemo(() => ({
    proj: projectionResult.goalReal?.month ?? null,
    real: realResult.goalReal?.month ?? null,
    proj2: hybridResult.goalReal?.month ?? null,
  }), [projectionResult, realResult, hybridResult]);
  const goalMonthsSemIR = useMemo(() => ({
    proj: projectionResult.goalRealGross?.month ?? null,
    real: realResult.goalRealGross?.month ?? null,
    proj2: hybridResult.goalRealGross?.month ?? null,
  }), [projectionResult, realResult, hybridResult]);

  const handleFetchReal = async () => {
    setFetching(true);
    setFetchStatus(null);
    try {
      const fetched = await fetchRealData(data.settings.startDate);
      const monthsFound = Object.keys(fetched).length;
      setData((prev) => ({ ...prev, realData: { ...prev.realData, ...fetched } }));
      setFetchStatus(
        monthsFound > 0
          ? `${monthsFound} mês(es) de dados reais atualizados a partir de ${parseISODate(data.settings.startDate).toLocaleDateString('pt-BR')}.`
          : 'Nenhum dado novo publicado ainda para o período.'
      );
    } catch (err) {
      setFetchStatus(`Erro ao buscar dados: ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importJSON(file);
      setData(imported);
    } catch {
      alert('Não foi possível ler esse arquivo JSON.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <>
      <button className="btn" onClick={onBack} style={{ marginBottom: 14 }}>← Meus projetos</button>

      <header className="app-header">
        <div>
          {editingName ? (
            <input
              autoFocus
              defaultValue={projectName}
              onBlur={(e) => commitName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName(e.target.value);
                if (e.key === 'Escape') setEditingName(false);
              }}
              style={{ fontSize: '1.5rem', fontWeight: 650, padding: '2px 6px' }}
            />
          ) : (
            <h1 style={{ cursor: 'pointer' }} onClick={() => setEditingName(true)} title="Clique para renomear">{projectName}</h1>
          )}
          <p className="subtitle">Meta {data.settings.goal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} em valor de {baseYear} · aporte inicial mensal corrigido pela inflação</p>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={() => exportJSON(data, sanitizeFilename(projectName))}>Exportar JSON</button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>Importar JSON</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-primary" onClick={handleFetchReal} disabled={fetching}>
            {fetching ? 'Buscando…' : 'Buscar dados reais (BCB)'}
          </button>
        </div>
      </header>

      {fetchStatus && <p className="fetch-status" style={{ marginBottom: 16 }}>{fetchStatus}</p>}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Resumo' && (
        <>
          <SummaryCards result={realResult} hybridResult={hybridResult} projectionResult={projectionResult} settings={data.settings} currentMonthIndex={currentMonthIndex} />
          <div style={{ height: 20 }} />
          <ProjectionChart
            chartData={chartData}
            goal={data.settings.goal}
            baseYear={baseYear}
            goalMonthsNominal={goalMonthsNominal}
            goalMonthsSemIR={goalMonthsSemIR}
            goalMonthsReal={goalMonthsReal}
          />
        </>
      )}

      {tab === 'Parâmetros' && (
        <SettingsPanel settings={data.settings} onChange={(settings) => setData((prev) => ({ ...prev, settings }))} />
      )}

      {tab === 'Investimentos' && (
        <InvestmentsPanel
          investments={data.investments}
          onChange={(investments) => setData((prev) => ({ ...prev, investments }))}
          contributions={data.contributions}
          onContributionsChange={(contributions) => setData((prev) => ({ ...prev, contributions }))}
          currentBalances={currentBalanceByInvestment}
          grossBalances={grossBalanceByInvestment}
          zeroAmounts={zeroAmountByInvestment}
        />
      )}

      {tab === 'Distribuição' && (
        <DistributionChart investments={visibleInvestments} balances={currentBalanceByInvestment} />
      )}

      {tab === 'Projeção' && (
        <ProjectionTable rows={realResult.rows} baseYear={baseYear} />
      )}
    </>
  );
}
