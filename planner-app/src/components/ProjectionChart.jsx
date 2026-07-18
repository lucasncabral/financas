import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { formatBRL } from '../lib/finance';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {payload.map((p) => p.value != null && (
        <div key={p.dataKey} style={{ color: 'var(--text-primary)' }}>
          <span className="legend-dot" style={{ background: p.color }} />
          {p.name}: {formatBRL(p.value)}
        </div>
      ))}
    </div>
  );
}

// Bolinha marcando o mês em que a linha bate a meta - `goalMonth` é o índice
// de mês (1-indexado) devolvido por goalNominal/goalReal em projection.js.
// Retorna null pra todo ponto que não for esse mês, então a linha fica sem
// nenhum marcador exceto no ponto da meta.
function makeGoalDot(goalMonth, color) {
  return (props) => {
    const { cx, cy, payload } = props;
    if (goalMonth == null || payload?.month !== goalMonth || cx == null || cy == null) return null;
    return <circle key={`goal-${goalMonth}`} cx={cx} cy={cy} r={5} style={{ fill: color, stroke: 'var(--surface-1)', strokeWidth: 2 }} />;
  };
}

function Chart({ data, dataKeyProj, dataKeyReal, dataKeyProj2, goal, yFormatter, goalMonths, showGoalDots = true }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--baseline)' }} minTickGap={40} />
          <YAxis tickFormatter={yFormatter} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={goal} stroke="var(--baseline)" strokeDasharray="4 4" label={{ value: 'Meta', fill: 'var(--muted)', fontSize: 11, position: 'insideTopLeft' }} />
          <Line type="monotone" dataKey={dataKeyProj} name="Projetado" stroke="var(--series-projetado)" strokeWidth={2} dot={showGoalDots ? makeGoalDot(goalMonths.proj, 'var(--series-projetado)') : false} isAnimationActive={false} />
          <Line type="monotone" dataKey={dataKeyProj2} name="Projetado ajustado" stroke="var(--series-projetado2)" strokeWidth={2} dot={showGoalDots ? makeGoalDot(goalMonths.proj2, 'var(--series-projetado2)') : false} isAnimationActive={false} />
          <Line type="monotone" dataKey={dataKeyReal} name="Real" stroke="var(--series-real)" strokeWidth={2} dot={showGoalDots ? makeGoalDot(goalMonths.real, 'var(--series-real)') : false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ProjectionChart({ chartData, goal, baseYear, goalMonthsNominal, goalMonthsReal }) {
  const money = (v) => `${Math.round(v / 1000)}k`;
  return (
    <div className="panel">
      <h2>Saldo nominal ao longo do tempo</h2>
      <div className="legend-row">
        <span><span className="legend-dot" style={{ background: 'var(--series-projetado)' }} />Projetado (médias assumidas)</span>
        <span><span className="legend-dot" style={{ background: 'var(--series-projetado2)' }} />Projetado ajustado (real até hoje + IPCA+5% daqui pra frente)</span>
        <span><span className="legend-dot" style={{ background: 'var(--series-real)' }} />Real (seus aportes registrados + índices do Banco Central)</span>
      </div>
      <Chart data={chartData} dataKeyProj="projNominal" dataKeyProj2="proj2Nominal" dataKeyReal="realNominal" goal={goal} yFormatter={money} goalMonths={goalMonthsNominal} showGoalDots={false} />

      <h2 style={{ marginTop: 28 }}>Saldo líquido de IR, a valor de {baseYear} (poder de compra)</h2>
      <div className="legend-row">
        <span><span className="legend-dot" style={{ background: 'var(--series-projetado)' }} />Projetado</span>
        <span><span className="legend-dot" style={{ background: 'var(--series-projetado2)' }} />Projetado ajustado</span>
        <span><span className="legend-dot" style={{ background: 'var(--series-real)' }} />Real</span>
      </div>
      <Chart data={chartData} dataKeyProj="projReal" dataKeyProj2="proj2Real" dataKeyReal="realReal" goal={goal} yFormatter={money} goalMonths={goalMonthsReal} />
    </div>
  );
}
