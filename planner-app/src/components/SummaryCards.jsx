import { formatBRL, formatPct, parseISODate } from '../lib/finance';
import { monthsToYearsLabel, remainingTimeLabel } from '../lib/projection';

function Tile({ label, value, sub }) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function GoalProgress({ pct, monthLabel, sub, projPct, projBalance, baseYear }) {
  const clamped = Math.min(Math.max(pct, 0), 1);
  const clampedProj = projPct != null ? Math.min(Math.max(projPct, 0), 1) : null;
  const deltaPct = projPct != null ? pct - projPct : null;
  const isFlat = deltaPct != null && Math.abs(deltaPct) < 0.0005;
  const isAhead = deltaPct != null && deltaPct >= 0;

  return (
    <div className="panel goal-progress">
      <div className="goal-progress-header">
        <div>
          <h2 style={{ marginBottom: 2 }}>Progresso da meta</h2>
          <p className="help-text" style={{ marginTop: 0 }}>Em {monthLabel}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="goal-progress-pct">{formatPct(pct, 1)}</div>
          {deltaPct != null && (
            <div className={`goal-progress-delta ${isFlat ? '' : isAhead ? 'good' : 'critical'}`}>
              {isFlat ? 'igual à projeção' : `${isAhead ? '▲' : '▼'} ${formatPct(Math.abs(deltaPct), 1)} ${isAhead ? 'acima' : 'abaixo'} da projeção`}
            </div>
          )}
        </div>
      </div>
      <div className="goal-progress-track" role="progressbar" aria-valuenow={Math.round(pct * 1000) / 10} aria-valuemin={0} aria-valuemax={100}>
        <div className="goal-progress-fill" style={{ width: `${clamped * 100}%` }} />
        {clampedProj != null && (
          <div className="goal-progress-marker" style={{ left: `${clampedProj * 100}%` }} title={`Projeção original: ${formatPct(projPct, 1)}`} />
        )}
      </div>
      <p className="help-text" style={{ marginTop: 8, marginBottom: 0 }}>{sub}</p>
      {projBalance != null && (
        <p className="help-text" style={{ marginTop: 2, marginBottom: 0 }}>
          A linha vertical marca onde a projeção original esperava estar - {formatBRL(projBalance)} (valor de {baseYear}) neste mês.
        </p>
      )}
    </div>
  );
}

export default function SummaryCards({ result, projectionResult, settings, currentMonthIndex }) {
  const { goalNominal, goalReal, rows } = result;
  const last = rows[rows.length - 1];
  const baseYear = parseISODate(settings.startDate).getFullYear();

  const clampedIndex = Math.min(Math.max(currentMonthIndex, 1), rows.length);
  const currentRow = rows[clampedIndex - 1];
  const projRow = projectionResult?.rows?.[clampedIndex - 1];

  return (
    <>
      <GoalProgress
        pct={currentRow.pctOfGoal}
        monthLabel={currentRow.date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        sub={`Saldo líquido de IR (valor de ${baseYear}): ${formatBRL(currentRow.realBalance)} de ${formatBRL(settings.goal)}`}
        projPct={projRow?.pctOfGoal}
        projBalance={projRow?.realBalance}
        baseYear={baseYear}
      />
      <div className="stat-grid">
        <Tile
          label="Meta atingida (saldo nominal)"
          value={remainingTimeLabel(goalNominal?.month, currentMonthIndex)}
          sub={goalNominal ? `De: ${monthsToYearsLabel(goalNominal.month)} · mês ${goalNominal.month} · ${goalNominal.date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}` : undefined}
        />
        <Tile
          label={`Meta atingida (líquido de IR, valor de ${baseYear})`}
          value={remainingTimeLabel(goalReal?.month, currentMonthIndex)}
          sub={goalReal ? `De: ${monthsToYearsLabel(goalReal.month)} · mês ${goalReal.month} · ${goalReal.date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}` : undefined}
        />
        <Tile
          label={`Saldo projetado ao fim de ${settings.horizonYears} anos`}
          value={formatBRL(last.nominalBalance)}
          sub={`Líquido de IR, valor de ${baseYear}: ${formatBRL(last.realBalance)}`}
        />
        <Tile
          label="Total aportado no período"
          value={formatBRL(last.cumContribution)}
          sub={`Juros acumulados: ${formatBRL(last.cumInterest)}`}
        />
      </div>
    </>
  );
}
