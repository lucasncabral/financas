// Busca dados reais (IPCA, CDI, Selic) na API de Séries Temporais do Banco Central (SGS).
// Documentação: https://dadosabertos.bcb.gov.br/dataset/433-indice-nacional-de-precos-ao-consumidor-amplo-ipca

const SERIES = {
  ipca: 433, // IPCA - variação % mensal
  cdi: 4391, // Taxa CDI acumulada no mês, % a.m.
  selic: 4390, // Taxa Selic acumulada no mês, % a.m.
};

function toBcbDate(isoOrDate) {
  if (typeof isoOrDate === 'string') {
    // "yyyy-MM-dd" - parseado manualmente pra não cair em UTC e escorregar um dia
    // em fusos negativos (ex: Brasil) quando convertido de volta pra data local.
    const [yyyy, mm, dd] = isoOrDate.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  const dd = String(isoOrDate.getDate()).padStart(2, '0');
  const mm = String(isoOrDate.getMonth() + 1).padStart(2, '0');
  const yyyy = isoOrDate.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function fetchSeries(code, dataInicial, dataFinal) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;
  const res = await fetch(url);
  if (res.status === 404) return []; // sem dados no período (ainda não publicado)
  if (!res.ok) throw new Error(`Falha ao buscar série ${code}: HTTP ${res.status}`);
  return res.json();
}

function toMonthKey(dataStr) {
  // dataStr vem como "dd/MM/yyyy"
  const [, mm, yyyy] = dataStr.split('/');
  return `${yyyy}-${mm}`;
}

// Retorna { "2026-07": { ipca, cdi, selic }, ... } com valores mensais decimais (0.0090 = 0.90%)
export async function fetchRealData(startDateISO, endDate = new Date()) {
  const dataInicial = toBcbDate(startDateISO);
  const dataFinal = toBcbDate(endDate);

  const [ipca, cdi, selic] = await Promise.all([
    fetchSeries(SERIES.ipca, dataInicial, dataFinal),
    fetchSeries(SERIES.cdi, dataInicial, dataFinal),
    fetchSeries(SERIES.selic, dataInicial, dataFinal),
  ]);

  const result = {};
  const merge = (series, field) => {
    series.forEach((item) => {
      const key = toMonthKey(item.data);
      if (!result[key]) result[key] = {};
      const val = Number(String(item.valor).replace(',', '.'));
      if (Number.isFinite(val)) result[key][field] = val / 100;
    });
  };
  merge(ipca, 'ipca');
  merge(cdi, 'cdi');
  merge(selic, 'selic');

  return result;
}
