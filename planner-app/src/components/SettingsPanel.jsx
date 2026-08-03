import { parseISODate } from '../lib/finance';
import { defaultData } from '../data/defaultData';

const RATE_KEYS = ['contributionRealGrowthAnnual', 'assumedInflationAnnual', 'assumedCdiAnnual', 'assumedSelicAnnual'];

function Field({ label, help, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {help && <span className="help-text">{help}</span>}
    </label>
  );
}

export default function SettingsPanel({ settings, onChange }) {
  const set = (key, value) => onChange({ ...settings, [key]: value });
  const pct = (key) => Math.round(settings[key] * 10000) / 100; // decimal -> % editável
  const setPct = (key, value) => set(key, (Number(value) || 0) / 100);
  const baseYear = parseISODate(settings.startDate).getFullYear();
  const resetRates = () => {
    const restored = { ...settings };
    RATE_KEYS.forEach((key) => { restored[key] = defaultData.settings[key]; });
    onChange(restored);
  };

  return (
    <div className="panel">
      <div className="section-toolbar">
        <h2 style={{ marginBottom: 0 }}>Parâmetros da simulação</h2>
        <button className="btn" onClick={resetRates}>Restaurar taxas padrão</button>
      </div>
      <p style={{ marginBottom: 16, fontSize: '0.85rem' }}>
        Defina a meta, o aporte mensal e as médias que serão usadas para projetar os meses futuros.
        Índices reais (IPCA, CDI, Selic) substituem essas médias automaticamente assim que forem buscados.
      </p>
      <div className="field-grid">
        <Field label="Data de início (mês 1)">
          <input type="date" value={settings.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label={`Meta (líquida de IR, valor de ${baseYear})`}>
          <input type="number" min="0" step="1000" value={settings.goal} onChange={(e) => set('goal', Number(e.target.value))} />
        </Field>
        <Field label="Horizonte da simulação (anos)">
          <input type="number" min="1" max="60" value={settings.horizonYears} onChange={(e) => set('horizonYears', Number(e.target.value))} />
        </Field>
        <Field label="Aporte inicial (mês 1, R$)">
          <input type="number" min="0" step="50" value={settings.monthlyContribution} onChange={(e) => set('monthlyContribution', Number(e.target.value))} />
        </Field>
        <Field label="Crescimento real do aporte (% a.a.)" help="Reajuste do aporte acima da inflação">
          <input type="number" step="0.1" value={pct('contributionRealGrowthAnnual')} onChange={(e) => setPct('contributionRealGrowthAnnual', e.target.value)} />
        </Field>
        <Field label="Inflação média assumida (IPCA % a.a.)">
          <input type="number" step="0.1" value={pct('assumedInflationAnnual')} onChange={(e) => setPct('assumedInflationAnnual', e.target.value)} />
        </Field>
        <Field label="CDI médio assumido (% a.a.)">
          <input type="number" step="0.1" value={pct('assumedCdiAnnual')} onChange={(e) => setPct('assumedCdiAnnual', e.target.value)} />
        </Field>
        <Field label="Selic média assumida (% a.a.)">
          <input type="number" step="0.1" value={pct('assumedSelicAnnual')} onChange={(e) => setPct('assumedSelicAnnual', e.target.value)} />
        </Field>
      </div>

      <div className="field-standalone">
        <Field label="Data de nascimento (opcional)" help="Só pra mostrar com que idade a meta é atingida - não entra na projeção">
          <input type="date" value={settings.birthDate || ''} onChange={(e) => set('birthDate', e.target.value)} />
        </Field>
      </div>

      <div className="info-box">
        <strong>De onde vieram os valores padrão (CDI 11%, Selic 11,3%, IPCA 4%)?</strong>
        <p style={{ margin: '6px 0 0' }}>
          Da mediana das projeções do <strong>Boletim Focus</strong> (relatório semanal do Banco Central com a expectativa
          de mais de 100 instituições financeiras), média simples de 2026 a 2030. O CDI foi estimado como Selic − 0,10 p.p.
          (spread histórico entre os dois). Pesquisado em julho de 2026 - são só um ponto de partida, não uma garantia:
          o cenário econômico muda, então vale revisar esses números de tempos em tempos.
        </p>
      </div>
    </div>
  );
}
