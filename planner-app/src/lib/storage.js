import { defaultData } from '../data/defaultData';
import { projectKey, touchProject } from './projects';

// Versões antigas tinham um campo "valor inicial" por investimento. Agora todo
// dinheiro entra via aporte registrado (com data), então convertemos esse valor
// legado num aporte na data de início - uma única vez - e removemos o campo.
function migrateInitialAmounts(investments, contributions, startDate) {
  const migratedContributions = [...contributions];
  const migratedInvestments = investments.map((inv) => {
    if (!inv.initialAmount) return inv;
    migratedContributions.push({
      id: newContributionId(),
      investmentId: inv.id,
      date: startDate,
      amount: Number(inv.initialAmount) || 0,
    });
    const { initialAmount, ...rest } = inv;
    return rest;
  });
  return { investments: migratedInvestments, contributions: migratedContributions };
}

function normalize(parsed) {
  const settings = { ...defaultData.settings, ...parsed.settings };
  const { investments, contributions } = migrateInitialAmounts(
    Array.isArray(parsed.investments) ? parsed.investments : [],
    Array.isArray(parsed.contributions) ? parsed.contributions : [],
    settings.startDate
  );
  return {
    settings,
    investments,
    contributions,
    realData: parsed.realData || {},
  };
}

export function loadProjectData(id) {
  try {
    const raw = localStorage.getItem(projectKey(id));
    if (!raw) return structuredClone(defaultData);
    return normalize(JSON.parse(raw));
  } catch {
    return structuredClone(defaultData);
  }
}

export function saveProjectData(id, data) {
  localStorage.setItem(projectKey(id), JSON.stringify(data));
  touchProject(id);
}

// Se o navegador suportar (Chrome/Edge), abre o diálogo nativo "Salvar como" -
// dá pra escolher uma pasta sincronizada (Google Drive, OneDrive...) toda vez,
// e o navegador lembra da última pasta usada nas próximas exportações. Em
// navegadores sem suporte (Firefox/Safari), cai no download tradicional pra
// pasta padrão de downloads.
export async function exportJSON(data, suggestedName = 'planejamento-aposentadoria') {
  const json = JSON.stringify(data, null, 2);
  const filename = `${suggestedName}.json`;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // usuário cancelou o diálogo
      // qualquer outro erro cai no download tradicional abaixo
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const DIACRITICS_RE = new RegExp('[̀-ͯ]', 'g');

export function sanitizeFilename(name) {
  return (name || 'projeto')
    .normalize('NFD').replace(DIACRITICS_RE, '') // remove acentos
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'projeto';
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(normalize(JSON.parse(reader.result)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function newInvestmentId() {
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newContributionId() {
  return `ct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
