import { formatBRL, formatPct, parseISODate } from '../lib/finance';

// "2 anos e 3 meses" - duração por extenso, omitindo a parte zerada.
function monthsDurationLabel(m) {
  const years = Math.floor(m / 12);
  const rem = m % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'ano' : 'anos'}`);
  if (rem > 0 || years === 0) parts.push(`${rem} ${rem === 1 ? 'mês' : 'meses'}`);
  return parts.join(' e ');
}

// "2a 3m" - versão curta, pra caber na pílula de adiantado/atrasado.
function monthsShortLabel(m) {
  const years = Math.floor(m / 12);
  const rem = m % 12;
  const parts = [];
  if (years > 0) parts.push(`${years}a`);
  if (rem > 0 || years === 0) parts.push(`${rem}m`);
  return parts.join(' ');
}

// Idade (em anos e meses completos) no mês em que a meta é batida. O saldo
// cruza a meta ao longo do mês, então contamos a idade no fim dele - por isso
// basta a diferença ano/mês, sem olhar o dia do aniversário.
function ageLabelAt(birthDate, date) {
  if (!birthDate || !date) return null;
  const months = (date.getFullYear() - birthDate.getFullYear()) * 12 + (date.getMonth() - birthDate.getMonth());
  if (months < 0) return null;
  return monthsDurationLabel(months);
}

function monthYearLabel(date) {
  return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
}

// Uma linha "Estimativa / Plano" no rodapé do card: quando a meta é batida e,
// se houver data de nascimento, com que idade.
function GoalRow({ name, row, birthDate, emphasis }) {
  const age = ageLabelAt(birthDate, row?.date);
  return (
    <div className={`goal-card-row${emphasis ? ' is-primary' : ''}`}>
      <span className="goal-card-row-name">{name}</span>
      <span className="goal-card-row-value">
        {row ? monthYearLabel(row.date) : '—'}
        {age && <span className="goal-card-row-age">aos {age}</span>}
      </span>
    </div>
  );
}

// Compara o mês em que a meta foi batida na estimativa com o mês previsto na
// projeção original - mostra quanto tempo isso representa de adiantamento ou
// atraso. Sem exibição em caso de empate.
function TimingBadge({ estimateMonth, planMonth }) {
  if (estimateMonth == null || planMonth == null) return null;
  const diff = planMonth - estimateMonth;
  if (diff === 0) return <span className="goal-card-badge">no ritmo do plano</span>;
  const isAhead = diff > 0;
  return (
    <span className={`goal-card-badge ${isAhead ? 'good' : 'critical'}`}>
      {isAhead ? '▲' : '▼'} {monthsShortLabel(Math.abs(diff))} {isAhead ? 'adiantado' : 'atrasado'}
    </span>
  );
}

// Card "quando a meta é atingida" pra um dos três critérios de saldo. O valor
// grande é o tempo que ainda falta pela estimativa (Projetado ajustado - o
// mesmo mês usado na pílula de adiantado/atrasado); o rodapé compara a data
// da estimativa com a do plano original.
function GoalCard({ title, hint, estimate, plan, birthDate, currentMonthIndex }) {
  const month = estimate?.month ?? null;
  const remaining = month != null ? month - currentMonthIndex : null;

  let value = 'Não atingida';
  let caption = 'dentro do horizonte simulado';
  if (remaining != null && remaining <= 0) {
    value = 'Meta atingida';
    caption = `desde ${monthYearLabel(estimate.date)}`;
  } else if (remaining != null) {
    value = monthsDurationLabel(remaining);
    caption = 'a partir de hoje';
  }

  return (
    <article className="goal-card">
      <div className="goal-card-head">
        <div>
          <h3 className="goal-card-title">{title}</h3>
          <p className="goal-card-hint">{hint}</p>
        </div>
        <TimingBadge estimateMonth={month} planMonth={plan?.month} />
      </div>
      <div className="goal-card-value">{value}</div>
      <div className="goal-card-caption">{caption}</div>
      <div className="goal-card-rows">
        <GoalRow name="Estimativa" row={estimate} birthDate={birthDate} emphasis />
        <GoalRow name="Plano" row={plan} birthDate={birthDate} />
      </div>
    </article>
  );
}

function GoalProgress({ pct, monthLabel, balance, goal, projPct, projBalance, baseYear }) {
  const clamped = Math.min(Math.max(pct, 0), 1);
  const clampedProj = projPct != null ? Math.min(Math.max(projPct, 0), 1) : null;
  const deltaPct = projPct != null ? pct - projPct : null;
  const isFlat = deltaPct != null && Math.abs(deltaPct) < 0.0005;
  const isAhead = deltaPct != null && deltaPct >= 0;

  return (
    <div className="panel goal-progress">
      <div className="goal-card-head">
        <div>
          <h3 className="goal-card-title">Progresso da meta</h3>
          <p className="goal-card-hint">onde você está em {monthLabel}, sem desconto de IR</p>
        </div>
        {deltaPct != null && (
          <span className={`goal-card-badge ${isFlat ? '' : isAhead ? 'good' : 'critical'}`}>
            {isFlat ? 'igual à projeção' : `${isAhead ? '▲' : '▼'} ${formatPct(Math.abs(deltaPct), 1)} ${isAhead ? 'acima' : 'abaixo'} do plano`}
          </span>
        )}
      </div>
      <div className="goal-progress-pct">{formatPct(pct, 1)}</div>
      <div className="goal-progress-track" role="progressbar" aria-valuenow={Math.round(pct * 1000) / 10} aria-valuemin={0} aria-valuemax={100}>
        <div className="goal-progress-fill" style={{ width: `${clamped * 100}%` }} />
        {clampedProj != null && (
          <div className="goal-progress-marker" style={{ left: `${clampedProj * 100}%` }} title={`Plano original: ${formatPct(projPct, 1)}`} />
        )}
      </div>
      {clampedProj != null && <div className="goal-card-caption">a marca na barra é onde o plano original esperava estar</div>}
      <div className="goal-card-rows">
        <div className="goal-card-row is-primary">
          <span className="goal-card-row-name">Hoje</span>
          <span className="goal-card-row-value">
            {formatBRL(balance)}
            <span className="goal-card-row-age">de {formatBRL(goal)} ({baseYear})</span>
          </span>
        </div>
        {projBalance != null && (
          <div className="goal-card-row">
            <span className="goal-card-row-name">Plano esperava</span>
            <span className="goal-card-row-value">{formatBRL(projBalance)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SummaryCards({ result, hybridResult, projectionResult, settings, currentMonthIndex }) {
  const { rows } = result;
  // Os cards "quando a meta é atingida" usam o Projetado ajustado como
  // estimativa, não o Real - ver ProjectView.jsx. O Real continua usado pro
  // progresso da meta hoje.
  const baseYear = parseISODate(settings.startDate).getFullYear();
  const birthDate = settings.birthDate ? parseISODate(settings.birthDate) : null;

  const clampedIndex = Math.min(Math.max(currentMonthIndex, 1), rows.length);
  const currentRow = rows[clampedIndex - 1];
  const projRow = projectionResult?.rows?.[clampedIndex - 1];

  const cards = [
    {
      title: 'Saldo nominal',
      hint: 'valor de face, sem corrigir a inflação',
      estimate: hybridResult?.goalNominal,
      plan: projectionResult?.goalNominal,
    },
    {
      title: `Sem IR · valor de ${baseYear}`,
      hint: 'poder de compra de hoje',
      estimate: hybridResult?.goalRealGross,
      plan: projectionResult?.goalRealGross,
    },
    {
      title: `Líquido de IR · valor de ${baseYear}`,
      hint: 'Com o imposto pago',
      estimate: hybridResult?.goalReal,
      plan: projectionResult?.goalReal,
    },
  ];

  return (
    <>
      <GoalProgress
        pct={currentRow.pctOfGoalGross}
        monthLabel={currentRow.date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        balance={currentRow.realBalanceGross}
        goal={settings.goal}
        projPct={projRow?.pctOfGoalGross}
        projBalance={projRow?.realBalanceGross}
        baseYear={baseYear}
      />
      <div className="section-heading">
        <h2>Quanto falta pra meta</h2>
        <p className="help-text">
          Pela estimativa (real até hoje + IPCA&nbsp;+&nbsp;5% daqui pra frente), comparada com o plano original.
        </p>
      </div>
      <div className="goal-card-grid">
        {cards.map((card) => (
          <GoalCard
            key={card.title}
            title={card.title}
            hint={card.hint}
            estimate={card.estimate}
            plan={card.plan}
            birthDate={birthDate}
            currentMonthIndex={currentMonthIndex}
          />
        ))}
      </div>
    </>
  );
}
