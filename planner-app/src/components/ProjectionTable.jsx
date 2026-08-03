import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_REINVEST_SPREAD_ANNUAL, formatBRL, formatBRLPrecise, formatPct } from '../lib/finance';
import InfoTooltip from './InfoTooltip';

// "08/2026"
function monthLabel(date) {
  return date.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
}

// Agrupa por ano-calendário (não por blocos de 12 meses de simulação - senão
// o rótulo do ano fica deslocado quando o início do plano não é em janeiro).
// Aporte e rendimento são somados (fluxo acumulado do ano); saldo é foto do
// fim do ano; IPCA/CDI/Selic viram taxa anualizada (composta) do período, não
// só a taxa do último mês. `months` guarda as linhas que formaram o ano, pra
// poder abrir o ano e ver mês a mês sem recalcular nada.
function buildYearRows(rows) {
  const yearRows = [];
  let windowStart = 0;
  rows.forEach((r, idx) => {
    const nextRow = rows[idx + 1];
    const isLastOfYear = !nextRow || nextRow.date.getFullYear() !== r.date.getFullYear();
    if (!isLastOfYear) return;
    const windowRows = rows.slice(windowStart, idx + 1);
    const contribution = windowRows.reduce((s, wr) => s + wr.contribution, 0);
    const interest = windowRows.reduce((s, wr) => s + wr.interest, 0);
    const annualize = (key) => windowRows.reduce((acc, wr) => acc * (1 + wr[key]), 1) - 1;
    const allReal = windowRows.every((wr) => wr.isReal && !wr.partial);
    const anyReal = windowRows.some((wr) => wr.isReal);
    yearRows.push({
      ...r,
      contribution,
      interest,
      ipca: annualize('ipca'),
      cdi: annualize('cdi'),
      selic: annualize('selic'),
      isReal: anyReal,
      partial: !allReal,
      months: windowRows,
    });
    windowStart = idx + 1;
  });
  return yearRows;
}

// Números do trecho já vivido (mês 1 até hoje), pra faixa de cards no topo.
// A rentabilidade média é a média geométrica do retorno de cada mês,
// anualizada. O retorno do mês é `interest / investedBase` - a base já pesa
// cada aporte pela fração do mês em que ficou aplicado (ver projection.js),
// senão o pro-rata de um aporte grande apareceria como rentabilidade extra,
// distorção que é enorme nos primeiros meses, quando o aporte do mês é da
// ordem do saldo inteiro. Meses sem nada aplicado ficam de fora.
function buildStats(rows, planRows, currentMonthIndex, settings) {
  const elapsed = Math.min(Math.max(currentMonthIndex, 1), rows.length);
  const current = rows[elapsed - 1];
  const plan = planRows?.[elapsed - 1] || null;

  let growth = 1;
  let monthsWithBalance = 0;
  for (let i = 0; i < elapsed; i++) {
    const base = rows[i].investedBase;
    if (!(base > 0)) continue;
    growth *= 1 + rows[i].interest / base;
    monthsWithBalance++;
  }

  return {
    elapsed,
    contributed: current.cumContribution,
    planContributed: plan?.cumContribution ?? null,
    interest: current.cumInterest,
    balance: current.nominalBalance,
    interestShare: current.nominalBalance > 0 ? current.cumInterest / current.nominalBalance : null,
    avgContribution: current.cumContribution / elapsed,
    planAvgContribution: plan ? plan.cumContribution / elapsed : null,
    realizedAnnual: monthsWithBalance > 0 ? growth ** (12 / monthsWithBalance) - 1 : null,
    // O plano rende IPCA + 5% a.a. (ver defaultReinvestRate) - aqui usando a
    // inflação média assumida nos parâmetros, já que o real varia mês a mês.
    assumedAnnual: (1 + settings.assumedInflationAnnual) * (1 + DEFAULT_REINVEST_SPREAD_ANNUAL) - 1,
  };
}

// Pílula ▲/▼ comparando o realizado com o plano. `unit` define se a diferença
// é lida em % (proporção entre os dois) ou em pontos percentuais (taxas).
function DeltaBadge({ actual, expected, unit = 'ratio' }) {
  if (actual == null || expected == null || (unit === 'ratio' && expected === 0)) return null;
  const diff = unit === 'ratio' ? actual / expected - 1 : actual - expected;
  const threshold = unit === 'ratio' ? 0.005 : 0.001;
  if (Math.abs(diff) < threshold) return <span className="goal-card-badge">no plano</span>;
  const isAhead = diff > 0;
  const text = unit === 'ratio'
    ? formatPct(Math.abs(diff), 0)
    : `${(Math.abs(diff) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`;
  return (
    <span className={`goal-card-badge ${isAhead ? 'good' : 'critical'}`}>
      {isAhead ? '▲' : '▼'} {text}
    </span>
  );
}

function StatCard({ title, value, caption, badge, foot }) {
  return (
    <article className="stat-card">
      <div className="stat-card-head">
        <h3 className="stat-card-title">{title}</h3>
        {badge}
      </div>
      <div className="stat-card-value">{value}</div>
      {caption && <div className="stat-card-caption">{caption}</div>}
      {foot && <div className="stat-card-foot">{foot}</div>}
    </article>
  );
}

function StatStrip({ stats }) {
  const { elapsed, contributed, planContributed, interest, balance, interestShare } = stats;
  const { avgContribution, planAvgContribution, realizedAnnual, assumedAnnual } = stats;
  const monthsLabel = `em ${elapsed} ${elapsed === 1 ? 'mês' : 'meses'}`;

  return (
    <div className="stat-grid">
      <StatCard
        title="Aportado"
        value={formatBRL(contributed)}
        caption={monthsLabel}
        badge={<DeltaBadge actual={contributed} expected={planContributed} />}
        foot={planContributed != null ? `Plano previa aportar ${formatBRL(planContributed)}` : null}
      />
      <StatCard
        title="Rendimento"
        value={formatBRL(interest)}
        caption={interestShare != null ? `${formatPct(interestShare, 1)} do saldo veio de rendimento` : 'ainda sem saldo aplicado'}
        foot={`Saldo nominal hoje ${formatBRL(balance)}`}
      />
      <StatCard
        title="Aporte médio"
        value={`${formatBRL(avgContribution)}/mês`}
        caption={`média ${monthsLabel}`}
        foot={planAvgContribution != null ? `Plano previa aportar ${formatBRL(planAvgContribution)}/mês` : null}
      />
      <StatCard
        title="Rentabilidade"
        value={realizedAnnual != null ? `${formatPct(realizedAnnual, 1)} a.a.` : '—'}
        caption={realizedAnnual != null ? 'média realizada, anualizada' : 'ainda sem saldo aplicado'}
        badge={<DeltaBadge actual={realizedAnnual} expected={assumedAnnual} unit="points" />}
        foot={`Plano assume IPCA + 5% (≈ ${formatPct(assumedAnnual, 1)} a.a.)`}
      />
    </div>
  );
}

function ProjectionRow({ row, label, sub, showIndices, isCurrent, nested, expandable, expanded, onToggle, rowRef }) {
  const className = [
    'proj-row',
    row.isReal ? (row.partial ? 'is-partial' : 'is-real') : 'is-projected',
    nested ? 'is-nested' : '',
    isCurrent ? 'row-current-month' : '',
    expandable ? 'is-expandable' : '',
  ].filter(Boolean).join(' ');

  const pctOfGoal = Number.isFinite(row.pctOfGoalGross) ? row.pctOfGoalGross : 0;
  const goalFill = `${Math.min(Math.max(pctOfGoal, 0), 1) * 100}%`;

  return (
    <tr
      ref={rowRef}
      className={className}
      onClick={expandable ? onToggle : undefined}
      onKeyDown={expandable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
      } : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
    >
      <td className="cell-month">
        {expandable && <span className={`row-chevron${expanded ? ' is-open' : ''}`} aria-hidden="true">▸</span>}
        <span className="cell-month-label">{label}</span>
        {sub && <span className="cell-month-sub">{sub}</span>}
        {row.partial && <span className="badge badge-assumed cell-month-badge">parcial</span>}
      </td>
      <td className="col-sep">{formatBRLPrecise(row.contribution)}</td>
      <td className={row.interest < 0 ? 'num-negative' : undefined}>{formatBRLPrecise(row.interest)}</td>
      <td className="col-sep">{formatBRL(row.nominalBalance)}</td>
      <td>{formatBRL(row.netBalance)}</td>
      <td>{formatBRL(row.realBalanceGross)}</td>
      <td className="col-sep cell-goal" style={{ '--goal-fill': goalFill }}>
        <span>{formatPct(row.pctOfGoalGross, 1)}</span>
      </td>
      {showIndices && (
        <>
          <td className="col-sep cell-index">{formatPct(row.ipca)}</td>
          <td className="cell-index">{formatPct(row.cdi)}</td>
          <td className="cell-index">{formatPct(row.selic)}</td>
        </>
      )}
    </tr>
  );
}

export default function ProjectionTable({ rows, planRows, baseYear, settings, currentMonthIndex }) {
  // Padrão é mês a mês. São ~480 linhas num plano de 40 anos, mas a tabela já
  // abre rolada até o mês atual (ver scrollToCurrent) - a visão por ano fica a
  // um clique pra quem quiser o panorama.
  const [monthly, setMonthly] = useState(true);
  const [showIndices, setShowIndices] = useState(true);
  const currentYear = new Date().getFullYear();
  const [expandedYears, setExpandedYears] = useState(() => new Set([currentYear]));

  const scrollRef = useRef(null);
  const currentRowRef = useRef(null);

  const yearRows = useMemo(() => buildYearRows(rows), [rows]);
  const stats = useMemo(
    () => buildStats(rows, planRows, currentMonthIndex, settings),
    [rows, planRows, currentMonthIndex, settings]
  );

  // Rola o container (não a página) até deixar o mês/ano atual no meio da
  // área visível - por isso `offsetTop` em vez de scrollIntoView, que também
  // arrastaria a janela inteira.
  const scrollToCurrent = useCallback((behavior = 'smooth') => {
    const container = scrollRef.current;
    const row = currentRowRef.current;
    if (!container || !row) return;
    const target = row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior });
  }, []);

  useEffect(() => { scrollToCurrent('auto'); }, [monthly, scrollToCurrent]);

  const toggleYear = (year) => setExpandedYears((prev) => {
    const next = new Set(prev);
    if (next.has(year)) next.delete(year); else next.add(year);
    return next;
  });

  const now = new Date();
  const body = [];

  if (monthly) {
    rows.forEach((r) => {
      const isCurrent = r.date.getFullYear() === now.getFullYear() && r.date.getMonth() === now.getMonth();
      body.push(
        <ProjectionRow
          key={`m-${r.month}`}
          row={r}
          label={monthLabel(r.date)}
          sub={`#${r.month}`}
          showIndices={showIndices}
          isCurrent={isCurrent}
          rowRef={isCurrent ? currentRowRef : null}
        />
      );
    });
  } else {
    yearRows.forEach((yr) => {
      const isOpen = expandedYears.has(yr.year);
      const isCurrent = yr.year === now.getFullYear();
      body.push(
        <ProjectionRow
          key={`y-${yr.year}`}
          row={yr}
          label={String(yr.year)}
          sub={yr.months.length < 12 ? `${yr.months.length} ${yr.months.length === 1 ? 'mês' : 'meses'}` : null}
          showIndices={showIndices}
          isCurrent={isCurrent}
          expandable
          expanded={isOpen}
          onToggle={() => toggleYear(yr.year)}
          rowRef={isCurrent ? currentRowRef : null}
        />
      );
      if (isOpen) {
        yr.months.forEach((r) => body.push(
          <ProjectionRow
            key={`y-${yr.year}-m-${r.month}`}
            row={r}
            label={monthLabel(r.date)}
            sub={`#${r.month}`}
            showIndices={showIndices}
            nested
          />
        ));
      }
    });
  }

  return (
    <>
      <div className="section-heading">
        <h2>Como está indo até aqui</h2>
        <p className="help-text">
          Do mês 1 até hoje, com os aportes registrados e os índices já publicados - comparado com o plano original.
        </p>
      </div>
      <StatStrip stats={stats} />

      <div className="panel">
        <div className="table-toolbar">
          <div className="segmented" role="group" aria-label="Agrupamento da tabela">
            <button type="button" className={monthly ? 'active' : ''} onClick={() => setMonthly(true)} aria-pressed={monthly}>
              Mês a mês
            </button>
            <button type="button" className={monthly ? '' : 'active'} onClick={() => setMonthly(false)} aria-pressed={!monthly}>
              Por ano
            </button>
          </div>
          <span className="toolbar-spacer" />
          <button type="button" className="btn" onClick={() => scrollToCurrent()}>Ir pra hoje</button>
          <button
            type="button"
            className={`btn${showIndices ? ' is-on' : ''}`}
            onClick={() => setShowIndices((v) => !v)}
            aria-pressed={showIndices}
          >
            Índices
          </button>
        </div>

        <div className="table-scroll" ref={scrollRef}>
          <table className="projection-table">
            <thead>
              <tr className="col-group-row">
                <th />
                <th colSpan={2} className="col-sep">{monthly ? 'Fluxo do mês' : 'Fluxo do ano'}</th>
                <th colSpan={3} className="col-sep">Saldo no fim do período</th>
                <th className="col-sep">Meta</th>
                {showIndices && <th colSpan={3} className="col-sep">Índices{monthly ? ' do mês' : ' do ano'}</th>}
              </tr>
              <tr>
                <th>{monthly ? 'Mês' : 'Ano'}</th>
                <th className="col-sep">Aporte</th>
                <th>Rendimento</th>
                <th className="col-sep">Nominal</th>
                <th>
                  Líquido de IR
                  <InfoTooltip below text="Desconta o Imposto de Renda regressivo estimado sobre o ganho de cada investimento (0% pros isentos)." />
                </th>
                <th>Valor de {baseYear}</th>
                <th className="col-sep">
                  % da meta
                  <InfoTooltip below text={`Usa o saldo em valor de ${baseYear} sem descontar o IR - só corrigido pela inflação.`} />
                </th>
                {showIndices && (
                  <>
                    <th className="col-sep">IPCA</th>
                    <th>CDI</th>
                    <th>Selic</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>{body}</tbody>
          </table>
        </div>

        <div className="table-legend">
          <span><span className="legend-bar is-real" />dado real</span>
          <span><span className="legend-bar is-partial" />mês parcial (algum índice ainda não publicado)</span>
          <span><span className="legend-bar" />projetado</span>
          {!monthly && <span className="table-legend-hint">clique num ano pra abrir os meses</span>}
        </div>
      </div>
    </>
  );
}
