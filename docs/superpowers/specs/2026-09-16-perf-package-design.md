# Especificação Técnica — Pacote de Alta Performance no FPA-ARGOS

- **Data:** 16 de Setembro de 2026
- **Status:** Proposto para Validação
- **Escopo:** Pacote de 3 Otimizações de Alto Impacto:
  1. **Compressão HTTP Gzip / Deflate de Payloads no `server.js`** (API e Assets Estáticos).
  2. **Debounce nos Handlers de Input de Busca** (Fim do engasgo em buscas SIGTAP, BPA e CNES).
  3. **Skeleton Screens durante o Carregamento** (UX moderna com efeito shimmer anti-layout-shift).

---

## 1. Módulo de Compressão HTTP (`lib/compression.js` & `server.js`)

### 1.1 Contexto e Ganhos
O FPA-ARGOS trafega arquivos JSON de grande porte (ex: dados do CNES com 2 MB a 5 MB) e bibliotecas JavaScript pesadas (ex: `sigtap.js` com 1.47 MB).
Sem compressão HTTP, o operador aguarda segundos para baixar esses arquivos na rede local do hospital ou secretaria de saúde.

### 1.2 Regras de Compressão
- **Suporte Nativo:** Módulo `node:zlib` do Node.js (zero dependências npm).
- **Tipos Comprimíveis:** `application/json`, `text/html`, `text/css`, `application/javascript`, `text/plain`, `image/svg+xml`, `text/csv`.
- **Limiar Mínimo:** Apenas payloads > 1 KB (`1024 bytes`) são comprimidos, evitando overhead de CPU em respostas pequenas.
- **Cabeçalhos Injetados:**
  - `Content-Encoding: gzip` (ou `deflate` se cliente solicitar).
  - `Vary: Accept-Encoding`.
  - Remoção de `Content-Length` estático ou recálculo do tamanho comprimido.
- **Transparência:** Respostas para clientes que não enviam `Accept-Encoding` continuam trafegando sem compressão intactas.

---

## 2. Utilitário de Debounce nos Inputs de Busca (`lib/debounce.js` e Frontend)

### 2.1 Contexto e Ganhos
Atualmente, as buscas em `#searchBpaInput` (em `bpa-module.js`) e `#searchUnidade` (em `app.js`) executam a cada caractere digitado (`addEventListener('input')`), disparando repaints de centenas de nós e relendo filtros complexos. A digitação rápida trava o cursor.

### 2.2 Arquitetura da Solução
- Função utilitária isomórfica `debounce(fn, delayMs = 300)`:
  - Cancela o timeout anterior se novas teclas forem pressionadas antes de 300ms.
  - Executa apenas uma vez após a pausa da digitação.
- **Pontos de Aplicação:**
  - `bpa-module.js`: `#searchBpaInput` (evita 16 re-renders ao digitar "ultrassonografia").
  - `app.js`: `#searchUnidade` e busca de tabelas.
  - `producao-profissional-module.js`: campo de busca de produção.
  - `users.js`: campo de busca de usuários.

---

## 3. Sistema de Skeleton Screens Shimmer (`css/style.css` & Frontend)

### 3.1 Contexto e Ganhos
Telas em branco ou texto "Carregando..." provocam percepção de lentidão e salto repentino de elementos (*Cumulative Layout Shift - CLS*).
Seguindo o design system do `taste-skill`, os Skeletons criam a percepção de carregamento instantâneo.

### 3.2 Arquitetura da Solução
- **CSS Shimmer:** Animação suave `@keyframes argos-shimmer` com gradiente neutro `#f1f5f9` -> `#e2e8f0` -> `#f1f5f9`.
- **Classes Utilitárias:**
  - `.skeleton-shimmer`: Base pulsante.
  - `.skeleton-card`: Estrutura simulando cards de produção BPA / Unidades CNES.
  - `.skeleton-line`: Linhas com alturas e larguras variadas (`.short`, `.medium`, `.full`).
  - `.skeleton-table-row`: Linhas simulando tabelas de auditoria.
- **Funções Renderizadoras:**
  - `renderSkeletonCards(containerEl, count)`
  - `renderSkeletonTable(tbodyEl, rows, cols)`
  - Integradas ao ciclo de vida de carregamento do `BpaModule` e `App`.

---

## 4. Estratégia de Testes Automatizados (TDD)

1. `test/compression.test.js`:
   - Valida compressão Gzip e Deflate de buffers JSON e texto.
   - Valida que payloads < 1KB ou tipos binários não são comprimidos.
2. `test/debounce.test.js`:
   - Valida que múltiplos disparos rápidos dentro de 100ms executam apenas 1 vez ao final do timer.
3. `test/server-compression.test.js`:
   - Teste de integração HTTP no `server.js` validando que `fetch(url, { headers: { 'accept-encoding': 'gzip' } })` retorna `content-encoding: gzip` e payload comprimido válido.
