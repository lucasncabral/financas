import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatBRLPrecise } from '../lib/finance';

// Categoria técnica por tipo de investimento (não o rótulo específico do
// índice) - CDI% e Selic% são ambos "pós-fixado", por exemplo.
const CATEGORIES = {
  CDI_PCT: { label: 'Pós-fixado', color: 'var(--series-projetado)' },
  SELIC_PCT: { label: 'Pós-fixado', color: 'var(--series-projetado)' },
  IPCA_PLUS: { label: 'Inflação', color: 'var(--series-real)' },
  PREFIXADO: { label: 'Pré-fixado', color: 'var(--series-3)' },
  POUPANCA: { label: 'Poupança', color: 'var(--series-4)' },
};

function CustomTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
      <div style={{ color: 'var(--text-primary)' }}>{name}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{percent.toFixed(1)}%</div>
    </div>
  );
}

function CustomLegend({ payload }) {
  return (
    <div className="legend-row" style={{ flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
      {payload.map((entry) => (
        <span key={entry.value}>
          <span className="legend-dot" style={{ background: entry.color }} />
          {entry.value}
        </span>
      ))}
    </div>
  );
}

// Label direto fora da fatia, em tinta neutra (nunca a cor da série - texto
// legível mesmo nas fatias claras que não têm contraste suficiente pro texto
// ir por cima do preenchimento).
function renderSliceLabel({ cx, cy, midAngle, outerRadius, percent, name }) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="var(--text-secondary)" fontSize={11} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function DistributionChart({ investments, balances }) {
  const totalsByCategory = {};
  investments.forEach((inv) => {
    const value = Math.max(0, balances[inv.id] ?? 0);
    if (value <= 0) return;
    const category = CATEGORIES[inv.type]?.label || inv.type;
    totalsByCategory[category] = (totalsByCategory[category] || 0) + value;
  });

  const data = Object.entries(totalsByCategory).map(([name, value]) => ({ name, value }));
  const total = data.reduce((s, d) => s + d.value, 0);

  const colorByName = {};
  Object.values(CATEGORIES).forEach((c) => { colorByName[c.label] = c.color; });

  return (
    <div className="panel">
      <h2>Distribuição por tipo de investimento</h2>
      {data.length === 0 ? (
        <p>Nenhum investimento com saldo pra distribuir ainda.</p>
      ) : (
        <>
          <p style={{ marginBottom: 14, fontSize: '0.85rem' }}>
            Total: <strong style={{ color: 'var(--text-primary)' }}>{formatBRLPrecise(total)}</strong>, com base no valor líquido estimado de hoje de cada investimento (o mesmo saldo mostrado na aba Investimentos). Investimentos ocultos da projeção não entram aqui.
          </p>
          <div style={{ height: 400 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={130}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                  label={renderSliceLabel}
                  labelLine={{ stroke: 'var(--baseline)' }}
                  isAnimationActive={false}
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={colorByName[d.name] || 'var(--muted)'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip total={total} />} />
                <Legend content={<CustomLegend />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
