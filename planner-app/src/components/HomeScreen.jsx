import { useMemo, useState } from 'react';
import { listProjects, createProject, renameProject, deleteProject } from '../lib/projects';
import { loadProjectData } from '../lib/storage';
import ConfirmDialog from './ConfirmDialog';

function ProjectCard({ project, onOpen, onRenamed, onRequestDelete }) {
  const [editing, setEditing] = useState(false);

  const stats = useMemo(() => {
    const data = loadProjectData(project.id);
    const investedTotal = data.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return {
      investmentCount: data.investments.length,
      investedTotal,
      goal: data.settings.goal,
    };
  }, [project.id]);

  const updated = project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('pt-BR') : null;

  const commitRename = (name) => {
    const trimmed = name.trim();
    if (trimmed) onRenamed(project.id, trimmed);
    setEditing(false);
  };

  return (
    <div className="project-card" onClick={() => !editing && onOpen(project.id)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        {editing ? (
          <input
            autoFocus
            defaultValue={project.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => commitRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(e.target.value);
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{ fontSize: '1.05rem', fontWeight: 650, padding: '2px 6px', flex: 1 }}
          />
        ) : (
          <h3 style={{ margin: 0 }}>{project.name}</h3>
        )}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn" onClick={(e) => { e.stopPropagation(); setEditing(true); }} aria-label={`Renomear ${project.name}`}>Renomear</button>
          <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); onRequestDelete(project); }} aria-label={`Excluir ${project.name}`}>Excluir</button>
        </div>
      </div>
      <p className="help-text" style={{ marginTop: 8 }}>
        {stats.investmentCount} investimento{stats.investmentCount === 1 ? '' : 's'} · {stats.investedTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} investidos · meta {stats.goal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
      </p>
      {updated && <p className="help-text" style={{ marginTop: 2 }}>Atualizado em {updated}</p>}
    </div>
  );
}

export default function HomeScreen({ onOpenProject }) {
  const [projects, setProjects] = useState(() => listProjects());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const refresh = () => setProjects(listProjects());

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const entry = createProject(name);
    setNewName('');
    setCreating(false);
    onOpenProject(entry.id);
  };

  const handleRenamed = (id, name) => {
    renameProject(id, name);
    refresh();
  };

  const confirmDelete = () => {
    deleteProject(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
  };

  return (
    <>
      <header className="app-header">
        <div>
          <h1>Meus projetos</h1>
          <p className="subtitle">Cada projeto tem suas próprias metas, investimentos e projeção - use um pra aposentadoria, outro pra sua carteira completa, etc.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Novo projeto</button>
        </div>
      </header>

      {creating && (
        <div className="panel">
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Nome do projeto</span>
              <input
                autoFocus
                placeholder="ex: Carteira completa"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                }}
              />
            </label>
            <button className="btn btn-primary" onClick={handleCreate}>Criar</button>
            <button className="btn" onClick={() => { setCreating(false); setNewName(''); }}>Cancelar</button>
          </div>
        </div>
      )}

      {projects.length === 0 && !creating && (
        <div className="panel">
          <p>Você ainda não tem nenhum projeto. Clique em "+ Novo projeto" pra começar.</p>
        </div>
      )}

      <div className="project-grid">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onOpen={onOpenProject} onRenamed={handleRenamed} onRequestDelete={setDeleteTarget} />
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir projeto"
        message={deleteTarget ? `Excluir o projeto "${deleteTarget.name}"? Essa ação não pode ser desfeita.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
