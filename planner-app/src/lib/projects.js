import { defaultData } from '../data/defaultData';

const INDEX_KEY = 'retirement-planner-projects-v1';
const PROJECT_KEY_PREFIX = 'retirement-planner-project-';
const LEGACY_KEY = 'retirement-planner-data-v1';

export function projectKey(id) {
  return `${PROJECT_KEY_PREFIX}${id}`;
}

function newProjectId() {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeIndex(list) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

// Antes só existia um projeto sem nome, guardado numa chave fixa. Na primeira
// vez que o novo formato roda, esse projeto único vira o primeiro item da
// lista (nomeado "Aposentadoria") - assim ninguém perde o que já tinha feito.
function ensureIndex() {
  let index = readIndex();
  if (index) return index;

  index = [];
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (legacyRaw) {
    const id = newProjectId();
    const now = new Date().toISOString();
    localStorage.setItem(projectKey(id), legacyRaw);
    index.push({ id, name: 'Aposentadoria', createdAt: now, updatedAt: now });
    localStorage.removeItem(LEGACY_KEY);
  }
  writeIndex(index);
  return index;
}

export function listProjects() {
  return ensureIndex()
    .slice()
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function createProject(name) {
  const index = ensureIndex();
  const id = newProjectId();
  const now = new Date().toISOString();
  const entry = { id, name: (name || '').trim() || 'Novo projeto', createdAt: now, updatedAt: now };
  writeIndex([...index, entry]);
  localStorage.setItem(projectKey(id), JSON.stringify(defaultData));
  return entry;
}

export function renameProject(id, name) {
  const index = ensureIndex();
  writeIndex(index.map((p) => (p.id === id ? { ...p, name: (name || '').trim() || p.name } : p)));
}

export function deleteProject(id) {
  const index = ensureIndex();
  writeIndex(index.filter((p) => p.id !== id));
  localStorage.removeItem(projectKey(id));
}

export function touchProject(id) {
  const index = ensureIndex();
  if (!index.some((p) => p.id === id)) return;
  writeIndex(index.map((p) => (p.id === id ? { ...p, updatedAt: new Date().toISOString() } : p)));
}

export function getProjectMeta(id) {
  return ensureIndex().find((p) => p.id === id) || null;
}
