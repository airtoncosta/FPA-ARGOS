# Especificação Técnica — Rate Limiting & Proteção de Tráfego no FPA-ARGOS

- **Data:** 16 de Setembro de 2026
- **Status:** Validado
- **Escopo:** Sub-projeto 1 da iniciativa de modernização e robustez (Rate Limiting, Índices de Banco, Background Jobs, Observabilidade).
- **Alvo:** Servidor Node.js nativo (`server.js`) e Supabase Edge Functions (`supabase/functions/`).

---

## 1. Contexto e Objetivos

O **FPA-ARGOS** integra sistemas sensíveis do SUS (DATASUS, FNS, SIGTAP, CNES) e provê funcionalidades de exportação/transmissão de produção BPA com disparo de e-mail (SMTP nativo e Resend API). 

Atualmente, o servidor `server.js` e as Edge Functions do Supabase não possuem controle de vazão (*rate limiting*). Essa ausência expõe a infraestrutura a riscos críticos:
1. **Bloqueio de IP por órgãos federais:** Rajadas de consultas automatizadas para o FNS ou DATASUS podem acarretar bloqueio do IP do servidor (HTTP 429 ou CAPTCHA).
2. **Esgotamento de cota de e-mail e bloqueio anti-spam:** Disparos contínuos via `/api/bpa/enviar-email` ou `/api/bpa/testar-conexao-email` podem consumir a cota mensal do Resend ou acionar banimento por spam no Google Workspace/Gmail SMTP.
3. **Ataques de força bruta e DoS:** Tentativas contínuas de login no endpoint `sign-in` do Supabase e chamadas abusivas a `/api/cnes/salvar` podem degradar os recursos do servidor.

O objetivo deste projeto é implementar uma **defesa em camadas**, com algoritmo de **Janela Deslizante Ponderada (*Weighted Sliding Window*)**, 100% nativa (zero dependências externas no Node.js) e com adaptação para Deno nas Edge Functions do Supabase.

---

## 2. Arquitetura do Componente `RateLimiter`

### 2.1 Algoritmo de Janela Deslizante Ponderada
Em vez de janelas fixas (que permitem o dobro do limite na virada da janela), o rate limiter utiliza:
- `windowMs`: Tamanho da janela em milissegundos (padrão: 60.000ms / 1 minuto).
- `maxRequests`: Número máximo permitido de requisições por janela.
- Estado por chave (`Map<string, Bucket>`):
  - `prevCount`: Quantidade de requisições na janela anterior.
  - `currCount`: Quantidade de requisições na janela atual.
  - `windowStart`: Timestamp de início da janela atual.

**Cálculo da estimativa de tráfego no instante `now`:**
```javascript
const elapsed = now - bucket.windowStart;
if (elapsed >= windowMs) {
    bucket.prevCount = (elapsed < 2 * windowMs) ? bucket.currCount : 0;
    bucket.currCount = 0;
    bucket.windowStart = now;
}
const weight = Math.max(0, (windowMs - (now - bucket.windowStart)) / windowMs);
const estimatedRequests = Math.floor(bucket.prevCount * weight) + bucket.currCount;
```

Se `estimatedRequests >= maxRequests`:
- Bloqueia a requisição (`allowed = false`).
- Calcula `retryAfterSeconds = Math.ceil((windowMs - (now - bucket.windowStart)) / 1000)`.

Se `estimatedRequests < maxRequests`:
- Permite a requisição (`allowed = true`).
- Incrementa `bucket.currCount++`.

### 2.2 Extração e Sanitização de IP
A extração do identificador do cliente analisa rigorosamente:
1. `req.headers['x-forwarded-for']`: Primeiro endereço da lista (lado do cliente real, ignorando proxies intermediários confiáveis).
2. `req.headers['x-real-ip']`: Cabeçalho comum de proxies reversos.
3. `req.socket.remoteAddress`: Fallback nativo do socket TCP.
4. Normalização de IPv6 mapeado para IPv4 (ex.: `::ffff:127.0.0.1` -> `127.0.0.1`).

### 2.3 Gestão de Memória e Coleta de Lixo (Garbage Collection)
Para garantir que o `Map` não cresça indefinidamente sob ataque de IPs rotativos (cardinalidade alta):
- Um temporizador periódico a cada 5 minutos (`cleanInterval = 300_000ms`) itera sobre as entradas.
- Entradas cuja última atividade ocorreu há mais de `2 * windowMs` são excluídas via `map.delete(key)`.
- O temporizador é marcado com `.unref()`, evitando impedir a finalização normal do processo Node.js em testes ou encerramentos graciosos.

---

## 3. Políticas de Tráfego e Classificação de Rotas

As rotas são categorizadas em 4 tiers:

| Tier | Categorias / Endpoints | Limite Padrão | Janela | Ação ao Exceder |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: E-mail & Autenticação** | `/api/bpa/enviar-email`<br>`/api/bpa/testar-conexao-email`<br>`supabase: sign-in`<br>`supabase: enviar-bpa-email` | **5 req** | 60s | HTTP 429 + Log de Auditoria |
| **Tier 2: Escrita e Persistência** | `/api/cnes/salvar`<br>`/api/bpa/email-config` (POST) | **15 req** | 60s | HTTP 429 |
| **Tier 3: Proxies Governamentais** | `/api/fns/*`<br>`/api/cnes/estabelecimentos`<br>`/api/cnes/municipio` | **60 req** | 60s | HTTP 429 |
| **Tier 4: Assets Estáticos & Geral** | `/*` (HTML, JS, CSS, fontes, JSON) | **300 req** | 60s | HTTP 429 |

---

## 4. Interface HTTP e Respostas

### 4.1 Cabeçalhos Injetados em Todas as Respostas
Em qualquer resposta gerenciada pelo rate limiter (permitida ou bloqueada):
- `RateLimit-Limit`: Valor máximo configurado para a categoria.
- `RateLimit-Remaining`: Requisições restantes disponíveis no ciclo atual.
- `RateLimit-Reset`: Segundos restantes até a janela reiniciar completamente.

### 4.2 Resposta de Bloqueio (HTTP 429)
Quando o cliente ultrapassa o limite:
- **Status:** `429 Too Many Requests`
- **Cabeçalho:** `Retry-After: <segundos>`
- **Cabeçalho:** `Content-Type: application/json; charset=utf-8`
- **Cabeçalhos CORS:** Totalmente preservados (`Access-Control-Allow-Origin: *`, etc.) para permitir tratamento sem falhas de cross-origin pelo frontend.
- **Corpo JSON:**
```json
{
  "success": false,
  "error": "Too Many Requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Limite de requisições excedido. Aguarde 45 segundos antes de tentar novamente.",
  "category": "email",
  "retryAfterSeconds": 45
}
```

---

## 5. Módulo Deno / Supabase Edge Functions

No diretório `code_sandbox_light_git_fe61910d_1781185357/supabase/functions/_shared/rate-limiter.ts`:
- Função utilitária `checkRateLimit(req: Request, category: string, limit: number, windowMs: number)`
- Extrai IP via `req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"`
- Se bloqueado, retorna `new Response(JSON.stringify(errorPayload), { status: 429, headers: corsHeaders })`.

---

## 6. Plano de Testes Automatizados (TDD)

1. **Unitário (`test/rate-limiter.test.js`):**
   - Deve permitir requisições abaixo do limite e decrementar `remaining`.
   - Deve rejeitar com `429` na requisição que exceder o limite.
   - Deve calcular o tempo correto de `retryAfterSeconds`.
   - Deve isolar contagens por IP e por categoria.
   - Deve limpar memória automaticamente na coleta de lixo.
2. **Integração (`test/server-rate-limit.test.js`):**
   - Subir servidor de teste temporário.
   - Disparar requisições para `/api/bpa/testar-conexao-email` e checar bloqueio no 6º disparo.
   - Checar se os headers `RateLimit-*` e `Retry-After` são entregues ao cliente.
