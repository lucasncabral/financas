import { useEffect, useRef, useState } from 'react';
import { formatBRLPrecise, formatPct } from '../lib/finance';

// Agrupa por ano-calendário (não por blocos de 12 meses de simulação - senão
// o rótulo do ano fica deslocado quando o início do plano não é em janeiro).
// Aporte e rendimento são somados (fluxo acumulado do ano); saldo é foto do
// fim do ano; IPCA/CDI/Selic viram taxa anualizada (composta) do período, não
// só a taxa do último mês.
function buildYearRows(rows) {
  const yearRows = [];
  let windowStart = 0;
  rows.forEach((r, idx) => {
    const nextRow = rows[idx + 1];
    const isLastOfYear = !nextRow || nextRow.date.getFullYear() !== r.date.getFullYear();
    if (isLastOfYear) {
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
      });
      windowStart = idx + 1;
    }
  });
  return yearRows;
}

function isCurrentRow(r, monthly, now) {
  return monthly
    ? r.date.getFullYear() === now.getFullYear() && r.date.getMonth() === now.getMonth()
    : r.date.getFullYear() === now.getFullYear();
}

export default function ProjectionTable({ rows, baseYear }) {
  const [monthly, setMonthly] = useState(true);
  const currentRowRef = useRef(null);

  const displayRows = monthly ? rows : buildYearRows(rows);

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: 'center' });
  }, [monthly]);

  return (
    <div className="panel">
      <div className="section-toolbar">
        <h2 style={{ marginBottom: 0 }}>Tabela de projeção</h2>
        <button className="btn" onClick={() => setMonthly((m) => !m)}>
          {monthly ? 'Ver por ano' : 'Ver mês a mês'}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Data</th>
              <th>Aporte{monthly ? '' : ' (ano)'}</th>
              <th>Rendimento</th>
              <th>Saldo nominal</th>
              <th>Saldo líquido</th>
              <th>Saldo (valor de {baseYear})</th>
              <th>% da meta</th>
              <th>IPCA</th>
              <th>CDI</th>
              <th>Selic</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => {
              const current = isCurrentRow(r, monthly, new Date());
              return (
                <tr key={r.month} ref={current ? currentRowRef : null} className={current ? 'row-current-month' : undefined}>
                  <td>{r.month}</td>
                  <td>{r.date.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}</td>
                  <td>{formatBRLPrecise(r.contribution)}</td>
                  <td>{formatBRLPrecise(r.interest)}</td>
                  <td>{formatBRLPrecise(r.nominalBalance)}</td>
                  <td>{formatBRLPrecise(r.netBalance)}</td>
                  <td>{formatBRLPrecise(r.realBalanceGross)}</td>
                  <td>{formatPct(r.pctOfGoalGross, 1)}</td>
                  <td>{formatPct(r.ipca)}</td>
                  <td>{formatPct(r.cdi)}</td>
                  <td>{formatPct(r.selic)}</td>
                  <td>
                    <span className={`badge ${r.isReal ? 'badge-real' : 'badge-assumed'}`}>
                      {r.isReal ? (r.partial ? 'real*' : 'real') : 'projetado'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="help-text">* mês com dado real parcial (algum índice ainda não publicado) - os demais índices usam a média assumida.</p>
      <p className="help-text">"Saldo líquido de IR" desconta o Imposto de Renda regressivo estimado sobre o ganho de cada investimento (0% pros isentos). O saldo em valor de {baseYear} e o "% da meta" usam o saldo sem descontar o IR (só a inflação).</p>
    </div>
  );
}
