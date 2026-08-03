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

function Chart({ data, dataKeyProj, dataKeyReal, dataKeyProj2, goal, yFormatter, goalMonths, showGoalDots = true, todayLabel }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 18, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--baseline)' }} minTickGap={40} />
          <YAxis tickFormatter={yFormatter} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={goal} stroke="var(--baseline)" strokeDasharray="4 4" label={{ value: 'Meta', fill: 'var(--muted)', fontSize: 11, position: 'insideTopLeft' }} />
          {/* Divisor entre o que já aconteceu (à esquerda) e o que ainda é projeção. */}
          {todayLabel && (
            <ReferenceLine
              x={todayLabel}
              stroke="var(--text-secondary)"
              strokeDasharray="3 4"
              strokeOpacity={0.7}
              label={{ value: 'Hoje', fill: 'var(--text-secondary)', fontSize: 11, position: 'top' }}
            />
          )}
          <Line type="monotone" dataKey={dataKeyProj} name="Projetado" stroke="var(--series-projetado)" strokeWidth={2} dot={showGoalDots ? makeGoalDot(goalMonths.proj, 'var(--series-projetado)') : false} isAnimationActive={false} />
          <Line type="monotone" dataKey={dataKeyProj2} name="Projetado ajustado" stroke="var(--series-projetado2)" strokeWidth={2} dot={showGoalDots ? makeGoalDot(goalMonths.proj2, 'var(--series-projetado2)') : false} isAnimationActive={false} />
          <Line type="monotone" dataKey={dataKeyReal} name="Real" stroke="var(--series-real)" strokeWidth={2} dot={showGoalDots ? makeGoalDot(goalMonths.real, 'var(--series-real)') : false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const SERIES = [
  { name: 'Projetado', color: 'var(--series-projetado)' },
  { name: 'Projetado ajustado', color: 'var(--series-projetado2)' },
  { name: 'Real', color: 'var(--series-real)' },
];

// Card de gráfico: mesmo cabeçalho dos cards de meta (título curto + linha
// explicando o critério), com a legenda em pílulas do lado direito.
function ChartCard({ title, hint, children }) {
  return (
    <section className="chart-card">
      <div className="goal-card-head">
        <div>
          <h3 className="goal-card-title">{title}</h3>
          <p className="goal-card-hint">{hint}</p>
        </div>
        <div className="chart-legend">
          {SERIES.map((s) => (
            <span key={s.name} className="chart-legend-item">
              <span className="legend-dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function ProjectionChart({ chartData, goal, baseYear, goalMonthsNominal, goalMonthsSemIR, goalMonthsReal, todayLabel }) {
  const money = (v) => `${Math.round(v / 1000)}k`;
  return (
    <>
      <div className="section-heading">
        <h2>Evolução do saldo</h2>
        <p className="help-text">
          <strong>Projetado</strong>: o plano original, com as médias assumidas ·{' '}
          <strong>Projetado ajustado</strong>: real até hoje + IPCA&nbsp;+&nbsp;5% daqui pra frente ·{' '}
          <strong>Real</strong>: seus aportes registrados + índices do Banco Central
        </p>
      </div>
      <div className="chart-stack">
        <ChartCard title="Saldo nominal" hint="valor de face, sem corrigir a inflação">
          <Chart data={chartData} dataKeyProj="projNominal" dataKeyProj2="proj2Nominal" dataKeyReal="realNominal" goal={goal} yFormatter={money} goalMonths={goalMonthsNominal} showGoalDots={false} todayLabel={todayLabel} />
        </ChartCard>

        <ChartCard title={`Sem IR · valor de ${baseYear}`} hint="poder de compra de hoje, antes do imposto">
          <Chart data={chartData} dataKeyProj="projSemIR" dataKeyProj2="proj2SemIR" dataKeyReal="realSemIR" goal={goal} yFormatter={money} goalMonths={goalMonthsSemIR} todayLabel={todayLabel} />
        </ChartCard>

        <ChartCard title={`Líquido de IR · valor de ${baseYear}`} hint="poder de compra de hoje, já com o imposto pago">
          <Chart data={chartData} dataKeyProj="projReal" dataKeyProj2="proj2Real" dataKeyReal="realReal" goal={goal} yFormatter={money} goalMonths={goalMonthsReal} todayLabel={todayLabel} />
        </ChartCard>
      </div>
    </>
  );
}
