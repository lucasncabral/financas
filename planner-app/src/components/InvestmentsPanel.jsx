import { useState } from 'react';
import { INVESTMENT_TYPES, INVESTMENT_TYPE_LABELS, DEFAULT_REINVEST_SPREAD_ANNUAL, formatBRLPrecise, parseISODate } from '../lib/finance';
import { newInvestmentId, newContributionId } from '../lib/storage';
import ConfirmDialog from './ConfirmDialog';
import InfoTooltip from './InfoTooltip';

const RATE_HELP = {
  [INVESTMENT_TYPES.CDI_PCT]: { label: '% do CDI', placeholder: 'ex: 120 = 120% do CDI', factor: 100 },
  [INVESTMENT_TYPES.SELIC_PCT]: { label: '% da Selic', placeholder: 'ex: 100 = 100% da Selic', factor: 100 },
  [INVESTMENT_TYPES.IPCA_PLUS]: { label: 'IPCA + % a.a.', placeholder: 'ex: 8.08', factor: 100 },
  [INVESTMENT_TYPES.PREFIXADO]: { label: 'Taxa fixa % a.a.', placeholder: 'ex: 12', factor: 100 },
  [INVESTMENT_TYPES.POUPANCA]: { label: '(regra da poupança)', placeholder: '', factor: 100 },
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rateSummary(inv) {
  const pct = Math.round(inv.rateParam * 10000) / 100;
  switch (inv.type) {
    case INVESTMENT_TYPES.CDI_PCT:
      return `${pct}% do CDI`;
    case INVESTMENT_TYPES.SELIC_PCT:
      return `${pct}% da Selic`;
    case INVESTMENT_TYPES.IPCA_PLUS:
      return `IPCA+ ${pct}% a.a.`;
    case INVESTMENT_TYPES.PREFIXADO:
      return `${pct}% a.a. prefixado`;
    case INVESTMENT_TYPES.POUPANCA:
      return 'Poupança (regra padrão)';
    default:
      return INVESTMENT_TYPE_LABELS[inv.type];
  }
}

function tagHue(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function TagBadge({ tag, onRemove }) {
  return (
    <span className="badge badge-tag" style={{ '--tag-hue': tagHue(tag) }}>
      {tag}
      {onRemove && (
        <button type="button" className="tag-remove" onClick={onRemove} aria-label={`Remover tag ${tag}`}>×</button>
      )}
    </span>
  );
}

function EyeIcon({ off }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function TagsEditor({ tags, onChange }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const value = input.trim();
    if (!value || tags.includes(value)) { setInput(''); return; }
    onChange([...tags, value]);
    setInput('');
  };

  const removeTag = (tag) => onChange(tags.filter((t) => t !== tag));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {tags.map((tag) => <TagBadge key={tag} tag={tag} onRemove={() => removeTag(tag)} />)}
      <input
        type="text"
        placeholder="+ tag (ex: aposentadoria)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
        onBlur={addTag}
        style={{ flex: '0 1 170px', fontSize: '0.8rem', padding: '3px 8px', borderRadius: 999, border: '1px solid var(--gridline)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
      />
    </div>
  );
}

function AddContributionForm({ onAdd, netBalance, grossBalance, onZero }) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');

  const submitAporte = () => {
    const value = Number(amount);
    if (!value) return;
    onAdd({ date, amount: value });
    setAmount('');
  };

  // O saque é informado em valor líquido (o que você de fato recebeu) - aqui
  // convertemos pro valor bruto equivalente usando a mesma proporção
  // líquido/bruto que o saldo atual desse investimento já tem, e registramos
  // como aporte negativo (reduz o saldo bruto rastreado pela simulação).
  const submitSaque = () => {
    const netValue = Number(amount);
    if (!netValue) return;
    const ratio = netBalance > 0 && grossBalance > 0 ? netBalance / grossBalance : 1;
    const grossValue = netValue / ratio;
    onAdd({ date, amount: -grossValue });
    setAmount('');
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: '0 0 150px' }}>
          <span>Data</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field" style={{ flex: '0 0 150px' }}>
          <span>Valor (R$)</span>
          <input type="number" min="0" step="10" placeholder="ex: 500" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={submitAporte}>+ Registrar aporte</button>
        <button className="btn" onClick={submitSaque}>− Registrar saque</button>
        {grossBalance > 0 && (
          <button
            type="button"
            className="btn"
            onClick={onZero}
            aria-label="Zerar investimento (sacar tudo)"
            title="Zerar investimento (sacar tudo)"
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <MoneyIcon />
          </button>
        )}
      </div>
      <p className="help-text" style={{ marginTop: 4 }}>
        No saque, informe o valor líquido que você recebeu - o sistema converte pro valor bruto retirado com base na proporção líquido/bruto do saldo atual.
      </p>
    </div>
  );
}

function InvestmentCard({ inv, onUpdate, onRequestRemove, onToggleHidden, contributions, onAddContribution, onRequestRemoveContribution, startExpanded, currentBalance, grossBalance, onRequestZero }) {
  const [expanded, setExpanded] = useState(startExpanded);
  const tags = inv.tags || [];
  const help = RATE_HELP[inv.type];
  const isPoupanca = inv.type === INVESTMENT_TYPES.POUPANCA;
  const isTaxExempt = isPoupanca || !!inv.taxExempt;
  const rateValue = isPoupanca ? '' : Math.round(inv.rateParam * help.factor * 100) / 100;
  const invContributions = contributions
    .filter((c) => c.investmentId === inv.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalRegistered = invContributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const summaryParts = [
    rateSummary(inv),
    `${formatBRLPrecise(totalRegistered)} investidos`,
  ];
  if (inv.maturityDate) summaryParts.push(`vence em ${parseISODate(inv.maturityDate).toLocaleDateString('pt-BR')}`);
  summaryParts.push(`valor hoje: ${formatBRLPrecise(grossBalance ?? totalRegistered)}`);
  if (inv.custodyFeeAnnual) summaryParts.push(`custódia ${Math.round(inv.custodyFeeAnnual * 10000) / 100}% a.a.`);
  if (inv.hidden) summaryParts.push('oculto da projeção');

  return (
    <div style={{ border: '1px solid var(--gridline)', borderRadius: 8, opacity: inv.hidden ? 0.6 : 1 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 12, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ color: 'var(--muted)', fontSize: '0.7rem', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600 }}>{inv.name}</div>
              {tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
            </div>
            {!expanded && <div className="help-text" style={{ marginTop: 2 }}>{summaryParts.join(' · ')}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            className="btn"
            onClick={(e) => { e.stopPropagation(); onToggleHidden(inv.id); }}
            aria-label={inv.hidden ? `Mostrar ${inv.name} na projeção` : `Ocultar ${inv.name} da projeção`}
            title={inv.hidden ? 'Oculto da projeção - clique pra mostrar' : 'Ocultar da projeção'}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <EyeIcon off={inv.hidden} />
          </button>
          <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); onRequestRemove(inv); }} aria-label={`Remover ${inv.name}`}>Remover</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {inv.hidden && (
            <p className="help-text" style={{ marginTop: 0, marginBottom: 10 }}>
              Este investimento está oculto - ele não entra nos totais da Projeção nem do Resumo. Útil pra isolar um investimento específico (ex: conferir se o saldo de um CDB bate com o do banco) sem o ruído dos outros.
            </p>
          )}
          <div className="investment-row" style={{ border: 'none', padding: 0 }}>
            <label className="field">
              <span>Nome</span>
              <input value={inv.name} onChange={(e) => onUpdate({ name: e.target.value })} />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select
                value={inv.type}
                onChange={(e) => onUpdate({
                  type: e.target.value,
                  taxExempt: e.target.value === INVESTMENT_TYPES.POUPANCA ? true : inv.taxExempt,
                })}
              >
                {Object.entries(INVESTMENT_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{help.label}</span>
              <input
                type="number"
                step="0.01"
                placeholder={help.placeholder}
                disabled={inv.type === INVESTMENT_TYPES.POUPANCA}
                value={rateValue}
                onChange={(e) => onUpdate({ rateParam: (Number(e.target.value) || 0) / help.factor })}
              />
            </label>
            <label className="field">
              <span>Vencimento (opcional)</span>
              <input type="date" value={inv.maturityDate || ''} onChange={(e) => onUpdate({ maturityDate: e.target.value || null })} />
            </label>
            <label className="field">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Custódia/adm. (% a.a.)
                <InfoTooltip text="Descontada direto do rendimento todo mês (diferente do IR, que só é estimado na hora do resgate)." />
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="ex: 0.20"
                value={inv.custodyFeeAnnual ? Math.round(inv.custodyFeeAnnual * 10000) / 100 : ''}
                onChange={(e) => onUpdate({ custodyFeeAnnual: (Number(e.target.value) || 0) / 100 })}
              />
            </label>
          </div>
          {inv.maturityDate && (
            <p className="help-text" style={{ marginTop: 6 }}>
              Depois de {parseISODate(inv.maturityDate).toLocaleDateString('pt-BR')}, a projeção para de usar essa taxa e passa a considerar o dinheiro reinvestido a IPCA + 5% a.a. (padrão).
            </p>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 10 }}>
            <input type="checkbox" checked={isTaxExempt} disabled={isPoupanca} onChange={(e) => onUpdate({ taxExempt: e.target.checked })} />
            Isento de IR (poupança, LCI/LCA, CRI/CRA, debêntures incentivadas...)
            <InfoTooltip text="Sem isenção: o ganho paga IR regressivo (22,5% até 180 dias, caindo até 15% depois de 720 dias), estimado pela idade média dos aportes." />
          </label>

          <div style={{ marginTop: 10 }}>
            <span className="help-text" style={{ marginBottom: 6, display: 'block' }}>
              Tags (ex: aposentadoria, reserva de emergência) - use pra agrupar investimentos com o mesmo objetivo.
            </span>
            <TagsEditor tags={tags} onChange={(newTags) => onUpdate({ tags: newTags })} />
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gridline)' }}>
            <div className="help-text" style={{ marginBottom: 6 }}>
              Aportes registrados{totalRegistered > 0 ? ` - total ${formatBRLPrecise(totalRegistered)}` : ''}
            </div>
            {invContributions.length > 0 && (
              <table style={{ marginBottom: 4 }}>
                <tbody>
                  {invContributions.map((c) => (
                    <tr key={c.id}>
                      <td style={{ textAlign: 'left' }}>{parseISODate(c.date).toLocaleDateString('pt-BR')}</td>
                      <td>{formatBRLPrecise(c.amount)}</td>
                      <td style={{ width: 1 }}>
                        <button className="btn btn-danger" onClick={() => onRequestRemoveContribution(c)}>Remover</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <AddContributionForm
              onAdd={onAddContribution}
              netBalance={currentBalance}
              grossBalance={grossBalance}
              onZero={() => onRequestZero(inv)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvestmentsPanel({ investments, onChange, contributions, onContributionsChange, currentBalances = {}, grossBalances = {}, zeroAmounts = {} }) {
  // Mesmo saldo bruto "valor hoje" mostrado em cada card - não o líquido
  // (que já desconta o IR estimado) nem a soma pura dos aportes.
  const totalInvested = investments.reduce((s, inv) => {
    const balance = grossBalances[inv.id];
    if (balance != null) return s + balance;
    const registered = contributions
      .filter((c) => c.investmentId === inv.id)
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    return s + registered;
  }, 0);
  const [lastAddedId, setLastAddedId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null); // { kind: 'investment' | 'contribution', ... }

  const update = (id, patch) => {
    onChange(investments.map((inv) => (inv.id === id ? { ...inv, ...patch } : inv)));
  };
  const toggleHidden = (id) => {
    onChange(investments.map((inv) => (inv.id === id ? { ...inv, hidden: !inv.hidden } : inv)));
  };
  const add = () => {
    const id = newInvestmentId();
    onChange([
      ...investments,
      { id, name: 'Novo investimento', type: INVESTMENT_TYPES.IPCA_PLUS, rateParam: DEFAULT_REINVEST_SPREAD_ANNUAL, maturityDate: null, tags: [] },
    ]);
    setLastAddedId(id);
  };

  const addContribution = (investmentId, entry) => {
    onContributionsChange([...contributions, { id: newContributionId(), investmentId, ...entry }]);
  };

  const latestContributionDate = (investmentId) => contributions
    .filter((c) => c.investmentId === investmentId)
    .reduce((max, c) => (c.date > max ? c.date : max), '');
  const sortedInvestments = [...investments].sort(
    (a, b) => latestContributionDate(b.id).localeCompare(latestContributionDate(a.id))
  );

  const requestZero = (inv) => {
    const gross = grossBalances[inv.id] || 0;
    if (gross <= 0) return;
    setRemoveTarget({ kind: 'zero', id: inv.id, name: inv.name, amount: formatBRLPrecise(gross) });
  };

  const confirmRemove = () => {
    if (removeTarget.kind === 'investment') {
      onChange(investments.filter((inv) => inv.id !== removeTarget.id));
      onContributionsChange(contributions.filter((c) => c.investmentId !== removeTarget.id));
    } else if (removeTarget.kind === 'contribution') {
      onContributionsChange(contributions.filter((c) => c.id !== removeTarget.id));
    } else if (removeTarget.kind === 'zero') {
      // Não é o saldo bruto puro - ver comentário de `zeroAmounts` em
      // ProjectView.jsx: saca um pouco menos (ou mais) pra compensar o
      // pro-rata do dia de hoje e o saldo final dar exatamente zero.
      const amount = zeroAmounts[removeTarget.id] ?? grossBalances[removeTarget.id] ?? 0;
      if (amount > 0) {
        addContribution(removeTarget.id, { date: todayISO(), amount: -amount });
      }
    }
    setRemoveTarget(null);
  };

  return (
    <div className="panel">
      <div className="section-toolbar">
        <h2 style={{ marginBottom: 0 }}>Meus investimentos</h2>
        <button className="btn btn-primary" onClick={add}>+ Adicionar investimento</button>
      </div>
      <p style={{ marginBottom: 14, fontSize: '0.85rem' }}>
        Total investido hoje: <strong style={{ color: 'var(--text-primary)' }}>{totalInvested.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>.
        Todo dinheiro que você colocar num investimento - inclusive o valor inicial - entra como um aporte registrado, com data. Isso alimenta a linha "Real" da projeção.
      </p>

      <div className="investments-list">
        {sortedInvestments.map((inv) => (
          <InvestmentCard
            key={inv.id}
            inv={inv}
            onUpdate={(patch) => update(inv.id, patch)}
            onRequestRemove={(investment) => setRemoveTarget({ kind: 'investment', id: investment.id, name: investment.name })}
            onToggleHidden={toggleHidden}
            contributions={contributions}
            onAddContribution={(entry) => addContribution(inv.id, entry)}
            onRequestRemoveContribution={(c) => setRemoveTarget({
              kind: 'contribution',
              id: c.id,
              investmentName: inv.name,
              date: parseISODate(c.date).toLocaleDateString('pt-BR'),
              amount: formatBRLPrecise(c.amount),
            })}
            startExpanded={inv.id === lastAddedId}
            currentBalance={currentBalances[inv.id]}
            grossBalance={grossBalances[inv.id]}
            onRequestZero={requestZero}
          />
        ))}
        {investments.length === 0 && <p>Nenhum investimento cadastrado ainda.</p>}
      </div>

      {investments.length > 0 && (
        <p className="help-text" style={{ marginTop: 10 }}>
          O "valor hoje" de cada investimento é bruto (sem descontar o IR estimado) e usa o rendimento do mês fechado pela simulação - o cálculo é por mês, não dia a dia, então pode ficar um pouco diferente do extrato real quando visto no meio do mês.
        </p>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title={
          removeTarget?.kind === 'investment'
            ? 'Remover investimento'
            : removeTarget?.kind === 'zero'
              ? 'Zerar investimento'
              : 'Remover aporte'
        }
        message={
          removeTarget?.kind === 'investment'
            ? `Remover "${removeTarget.name}"? Todos os aportes registrados nele também serão apagados. Essa ação não pode ser desfeita.`
            : removeTarget?.kind === 'contribution'
              ? `Remover o aporte de ${removeTarget.amount} em ${removeTarget.date} (${removeTarget.investmentName})? Essa ação não pode ser desfeita.`
              : removeTarget?.kind === 'zero'
                ? `Zerar "${removeTarget.name}"? Isso registra hoje um saque de ${removeTarget.amount} (o saldo bruto atual), deixando o saldo dele em zero daqui pra frente na projeção. Dá pra reverter depois removendo esse aporte na lista.`
                : ''
        }
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
