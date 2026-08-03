// Ícone "i" com balão explicativo no hover/foco (o `tabIndex` também deixa o
// balão abrir com toque no celular, onde não existe hover).
// `below` joga o balão pra baixo do ícone - necessário no cabeçalho da tabela,
// que fica grudado no topo de um container com `overflow: auto` e cortaria
// qualquer balão aberto pra cima.
export default function InfoTooltip({ text, below = false }) {
  return (
    <span className="info-tooltip" tabIndex={0}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="11" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className={`info-tooltip-bubble${below ? ' is-below' : ''}`}>{text}</span>
    </span>
  );
}
