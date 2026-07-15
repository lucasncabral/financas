# Planejador de Aposentadoria

App React (client-only, sem backend) para simular o caminho até uma meta
(ex: R$ 1.000.000 em valor de hoje) somando vários investimentos com regras
de rentabilidade diferentes (% do CDI, IPCA+, prefixado, poupança).

## Rodando localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Projetos

A tela inicial (`Meus projetos`) lista quantos projetos você quiser - cada um
com suas próprias metas, investimentos, aportes e projeção, totalmente
independentes entre si. Dá pra ter um projeto "Aposentadoria" e outro
"Carteira completa", por exemplo. Clique num projeto pra abrir, ou em
"+ Novo projeto" pra criar um do zero. Renomear/excluir ficam nos botões do
próprio card na tela inicial.

## Dentro de um projeto

- **Parâmetros**: meta, aporte mensal inicial (corrigido pela inflação + um
  crescimento real que você define), e as médias assumidas de IPCA/CDI/Selic
  usadas para projetar os meses futuros.
- **Investimentos**: cadastre cada investimento (nome, tipo, taxa, vencimento
  opcional). Cada card é retrátil - fechado, mostra um resumo em texto; aberto,
  mostra os campos e os aportes registrados (data + valor) daquele investimento.
  O ícone de olho oculta um investimento dos totais da Projeção/Resumo, útil
  pra isolar um só e conferir se o saldo bate com o extrato real.
- **Projeção**: tabela mês a mês com saldo nominal e saldo em valor do ano de
  início (poder de compra), separando o que já é real (dado do BCB ou aporte
  registrado) do que ainda é projetado.
- **Resumo**: cartões com "quando bato a meta" + gráfico comparando a linha
  **Projetado** (plano original) com a linha **Real** (histórico real +
  projeção pro que ainda não aconteceu).
- **Buscar dados reais (BCB)**: busca IPCA, CDI e Selic mês a mês na API
  pública do Banco Central (SGS) a partir da data de início e substitui a
  média assumida pelo valor real nos meses já ocorridos.

Os dados ficam salvos no `localStorage` do navegador (um registro por
projeto). Use os botões **Exportar/Importar JSON**, dentro de um projeto,
pra fazer backup ou mover os dados desse projeto entre navegadores/computadores.
