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

function Chart({ data, dataKeyProj, dataKeyReal, goal, yFormatter }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--baseline)' }} minTickGap={40} />
          <YAxis tickFormatter={yFormatter} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={goal} stroke="var(--baseline)" strokeDasharray="4 4" label={{ value: 'Meta', fill: 'var(--muted)', fontSize: 11, position: 'insideTopLeft' }} />
          <Line type="monotone" dataKey={dataKeyProj} name="Projetado" stroke="var(--series-projetado)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey={dataKeyReal} name="Real" stroke="var(--series-real)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ProjectionChart({ chartData, goal, baseYear }) {
  const money = (v) => `${Math.round(v / 1000)}k`;
  return (
    <div className="panel">
      <h2>Saldo nominal ao longo do tempo</h2>
      <div className="legend-row">
        <span><span className="legend-dot" style={{ background: 'var(--series-projetado)' }} />Projetado (médias assumidas)</span>
        <span><span className="legend-dot" style={{ background: 'var(--series-real)' }} />Real (seus aportes registrados + índices do Banco Central)</span>
      </div>
      <Chart data={chartData} dataKeyProj="projNominal" dataKeyReal="realNominal" goal={goal} yFormatter={money} />

      <h2 style={{ marginTop: 28 }}>Saldo líquido de IR, a valor de {baseYear} (poder de compra)</h2>
      <div className="legend-row">
        <span><span className="legend-dot" style={{ background: 'var(--series-projetado)' }} />Projetado</span>
        <span><span className="legend-dot" style={{ background: 'var(--series-real)' }} />Real</span>
      </div>
      <Chart data={chartData} dataKeyProj="projReal" dataKeyReal="realReal" goal={goal} yFormatter={money} />
    </div>
  );
}
