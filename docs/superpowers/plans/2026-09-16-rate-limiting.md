# Rate Limiting & Proteção de Tráfego — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sistema robusto de Rate Limiting com Janela Deslizante Ponderada (*Weighted Sliding Window Counter*) no servidor nativo Node.js (`server.js`) e nas Supabase Edge Functions (`sign-in` e `enviar-bpa-email`), protegendo o FPA-ARGOS contra bloqueios de APIs federais (FNS/DATASUS), abuso de e-mail e ataques de negação de serviço.

**Architecture:** Módulo nativo zero-dependências `lib/rate-limiter.js` com gerenciamento de memória em buckets (`Map`), extração confiável de IP e cabeçalhos RFC 6585. Middleware acoplado ao pipeline HTTP do `server.js` dividindo o tráfego em 4 tiers de criticidade, e helper Deno compartilhado em `supabase/functions/_shared/rate-limiter.ts`.

**Tech Stack:** Node.js (v24 nativo, `node:test`, `node:assert/strict`, `http`), Deno / TypeScript (Supabase Edge Functions).

**Spec:** [docs/superpowers/specs/2026-09-16-rate-limiting-design.md](file:///c:/Users/Controle/.gemini/antigravity-ide/scratch/FPA-ARGOS/docs/superpowers/specs/2026-09-16-rate-limiting-design.md)

## Global Constraints

- Zero dependências npm adicionais no servidor Node.js (`lib/rate-limiter.js` e `server.js` devem usar apenas APIs nativas do Node.js).
- Algoritmo de Janela Deslizante Ponderada (*Weighted Sliding Window*) em vez de Janela Fixa para evitar picos na transição de minuto.
- Coleta de lixo ativa com `.unref()` a cada 5 minutos para expurgar IPs inativos e impedir vazamento de memória.
- Headers obrigatórios em todas as respostas gerenciadas: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
- Resposta HTTP 429 obrigatória com header `Retry-After: <segundos>` e corpo JSON padronizado com CORS liberado.
- Limites por IP:
  - Tier 1 (E-mail & Auth): 5 requisições / 60s
  - Tier 2 (Escrita / Persistência): 15 requisições / 60s
  - Tier 3 (Proxies Federais FNS/CNES): 60 requisições / 60s
  - Tier 4 (Assets Estáticos & Geral): 300 requisições / 60s

---

## File Structure

```
FPA-ARGOS/
├── lib/
│   └── rate-limiter.js             # [NEW] Módulo core do Sliding Window Rate Limiter
├── server.js                       # [MODIFY] Injeção do middleware de rate limiting por tier
├── test/
│   ├── rate-limiter.test.js        # [NEW] Testes unitários do rate limiter (TDD)
│   ├── server-rate-limit.test.js   # [NEW] Testes de integração HTTP do server.js
│   └── edge-rate-limiter.test.js   # [NEW] Teste do helper compartilhado de Edge Functions
└── code_sandbox_light_git_fe61910d_1781185357/
    └── supabase/
        └── functions/
            ├── _shared/
            │   └── rate-limiter.ts # [NEW] Helper compartilhado para Deno/Supabase
            ├── sign-in/
            │   └── index.ts        # [MODIFY] Aplicação de rate limit de 5 req/min por IP
            └── enviar-bpa-email/
                └── index.ts        # [MODIFY] Aplicação de rate limit de 5 req/min por IP
```

---

### Task 1: Módulo Core `lib/rate-limiter.js` com Algoritmo Sliding Window

**Files:**
- Create: `lib/rate-limiter.js`
- Test: `test/rate-limiter.test.js`

**Interfaces:**
- Consumes: Nenhuma dependência externa.
- Produces: `class SlidingWindowRateLimiter(options)` com métodos:
  - `check(key, maxRequests, windowMs): { allowed: boolean, remaining: number, resetSeconds: number, retryAfterSeconds: number }`
  - `getClientIp(req): string`
  - `getHeaders(result, maxRequests): Record<string, string | number>`
  - `cleanup(): number` (retorna total de buckets removidos)
  - `destroy(): void` (encerra timer unref'd)

- [ ] **Step 1: Escrever teste unitário automatizado inicial (falha esperada)**

Criar `test/rate-limiter.test.js`:
```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { SlidingWindowRateLimiter } = require('../lib/rate-limiter');

describe('SlidingWindowRateLimiter', () => {
    let limiter;

    beforeEach(() => {
        limiter = new SlidingWindowRateLimiter({ windowMs: 60000 });
    });

    afterEach(() => {
        if (limiter) limiter.destroy();
    });

    test('permite requisições dentro do limite configurado', () => {
        const res1 = limiter.check('test-ip', 5, 60000);
        assert.equal(res1.allowed, true);
        assert.equal(res1.remaining, 4);

        const res2 = limiter.check('test-ip', 5, 60000);
        assert.equal(res2.allowed, true);
        assert.equal(res2.remaining, 3);
    });

    test('bloqueia requisições quando o limite é excedido e calcula retryAfterSeconds', () => {
        for (let i = 0; i < 5; i++) {
            assert.equal(limiter.check('flood-ip', 5, 60000).allowed, true);
        }
        const blocked = limiter.check('flood-ip', 5, 60000);
        assert.equal(blocked.allowed, false);
        assert.equal(blocked.remaining, 0);
        assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
    });

    test('isola contagens entre IPs diferentes', () => {
        for (let i = 0; i < 5; i++) {
            limiter.check('ip-a', 5, 60000);
        }
        assert.equal(limiter.check('ip-a', 5, 60000).allowed, false);
        assert.equal(limiter.check('ip-b', 5, 60000).allowed, true);
    });

    test('extrai IP corretamente considerando x-forwarded-for e IPv6', () => {
        const req1 = { headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' } };
        assert.equal(limiter.getClientIp(req1), '203.0.113.195');

        const req2 = { headers: {}, socket: { remoteAddress: '::ffff:192.168.1.50' } };
        assert.equal(limiter.getClientIp(req2), '192.168.1.50');
    });
});
```

- [ ] **Step 2: Executar teste para confirmar que falha (RED)**

Executar: `& 'C:\Program Files\nodejs\node.exe' --test test/rate-limiter.test.js`
Esperado: FAIL com `Cannot find module '../lib/rate-limiter'`

- [ ] **Step 3: Implementar `lib/rate-limiter.js` (GREEN)**

Criar `lib/rate-limiter.js`:
```javascript
/**
 * FPA-ARGOS — Sliding Window Counter Rate Limiter
 * Zero-dependency, thread-safe within event loop, memory-bounded.
 */

class SlidingWindowRateLimiter {
    constructor(options = {}) {
        this.defaultWindowMs = options.windowMs || 60000;
        this.buckets = new Map();

        // Expurgador periódico de memória a cada 5 minutos
        const cleanIntervalMs = options.cleanIntervalMs || 300000;
        this.cleanupTimer = setInterval(() => this.cleanup(), cleanIntervalMs);
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }

    getClientIp(req) {
        if (!req) return '127.0.0.1';
        const xForwarded = req.headers && req.headers['x-forwarded-for'];
        let ip = '';
        if (typeof xForwarded === 'string' && xForwarded.trim()) {
            ip = xForwarded.split(',')[0].trim();
        } else if (req.headers && req.headers['x-real-ip']) {
            ip = String(req.headers['x-real-ip']).trim();
        } else if (req.socket && req.socket.remoteAddress) {
            ip = req.socket.remoteAddress;
        } else if (req.connection && req.connection.remoteAddress) {
            ip = req.connection.remoteAddress;
        }
        ip = ip || '127.0.0.1';
        if (ip.startsWith('::ffff:')) {
            ip = ip.substring(7);
        }
        return ip;
    }

    check(key, maxRequests, windowMs = this.defaultWindowMs, now = Date.now()) {
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = {
                prevCount: 0,
                currCount: 0,
                windowStart: now
            };
            this.buckets.set(key, bucket);
        }

        const elapsed = now - bucket.windowStart;
        if (elapsed >= windowMs) {
            bucket.prevCount = (elapsed < 2 * windowMs) ? bucket.currCount : 0;
            bucket.currCount = 0;
            bucket.windowStart = now;
        }

        const elapsedInCurrentWindow = now - bucket.windowStart;
        const weight = Math.max(0, (windowMs - elapsedInCurrentWindow) / windowMs);
        const estimatedRequests = Math.floor(bucket.prevCount * weight) + bucket.currCount;

        const resetSeconds = Math.max(1, Math.ceil((windowMs - elapsedInCurrentWindow) / 1000));

        if (estimatedRequests >= maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetSeconds: resetSeconds,
                retryAfterSeconds: resetSeconds
            };
        }

        bucket.currCount += 1;
        const remaining = Math.max(0, maxRequests - (estimatedRequests + 1));

        return {
            allowed: true,
            remaining: remaining,
            resetSeconds: resetSeconds,
            retryAfterSeconds: 0
        };
    }

    getHeaders(result, maxRequests) {
        const headers = {
            'RateLimit-Limit': maxRequests,
            'RateLimit-Remaining': result.remaining,
            'RateLimit-Reset': result.resetSeconds
        };
        if (!result.allowed && result.retryAfterSeconds > 0) {
            headers['Retry-After'] = result.retryAfterSeconds;
        }
        return headers;
    }

    cleanup(now = Date.now(), maxIdleMs = 120000) {
        let deleted = 0;
        for (const [key, bucket] of this.buckets.entries()) {
            if (now - bucket.windowStart > maxIdleMs) {
                this.buckets.delete(key);
                deleted++;
            }
        }
        return deleted;
    }

    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.buckets.clear();
    }
}

module.exports = { SlidingWindowRateLimiter };
```

- [ ] **Step 4: Executar teste unitário e verificar aprovação (PASS)**

Executar: `& 'C:\Program Files\nodejs\node.exe' --test test/rate-limiter.test.js`
Esperado: PASS (todos os 4 testes passam).

---

### Task 2: Integração no Servidor Node.js (`server.js`)

**Files:**
- Modify: `server.js`
- Test: `test/server-rate-limit.test.js`

**Interfaces:**
- Consumes: `SlidingWindowRateLimiter` de `lib/rate-limiter.js`.
- Produces: Middleware de verificação que intercepta todas as requisições em `server.js` antes do roteamento, atribuindo a política correta:
  - `classifyRoute(pathname, method): { category: string, limit: number, windowMs: number }`
  - Se exceder limite: retorna status 429, headers e JSON.

- [ ] **Step 1: Escrever teste de integração HTTP para o servidor (RED)**

Criar `test/server-rate-limit.test.js`:
```javascript
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

describe('Server Rate Limiting Integration', () => {
    const TEST_PORT = 3899;

    before((done) => {
        process.env.PORT = String(TEST_PORT);
        require('../server.js');
        setTimeout(done, 500);
    });

    test('permite requisições e inclui headers RateLimit-*', async () => {
        const res = await fetch(`http://localhost:${TEST_PORT}/api/bpa/email-config`);
        assert.equal(res.status, 200);
        assert.ok(res.headers.has('ratelimit-limit'));
        assert.ok(res.headers.has('ratelimit-remaining'));
        assert.ok(res.headers.has('ratelimit-reset'));
    });

    test('bloqueia disparos de teste de e-mail ao exceder 5 requisições', async () => {
        let lastStatus = 200;
        let blockedResponse = null;

        for (let i = 0; i < 7; i++) {
            const res = await fetch(`http://localhost:${TEST_PORT}/api/bpa/testar-conexao-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destinatario: 'teste@exemplo.com' })
            });
            lastStatus = res.status;
            if (res.status === 429) {
                blockedResponse = await res.json();
                break;
            }
        }

        assert.equal(lastStatus, 429);
        assert.ok(blockedResponse);
        assert.equal(blockedResponse.code, 'RATE_LIMIT_EXCEEDED');
        assert.ok(blockedResponse.retryAfterSeconds > 0);
    });
});
```

- [ ] **Step 2: Executar teste de integração para confirmar falha (RED)**

Executar: `& 'C:\Program Files\nodejs\node.exe' --test test/server-rate-limit.test.js`
Esperado: FAIL (sem rate limiting ainda).

- [ ] **Step 3: Modificar `server.js` adicionando o rate limiter e políticas por tier**

Em `server.js`:
1. Importar `const { SlidingWindowRateLimiter } = require('./lib/rate-limiter');`
2. Instanciar `const globalRateLimiter = new SlidingWindowRateLimiter({ windowMs: 60000 });`
3. Criar função de classificação de rotas `getRateLimitPolicy(pathname, method)`.
4. Interceptar no início do callback de `http.createServer((req, res) => { ... })`:
   - Extrair IP do cliente
   - Classificar política
   - Verificar no `globalRateLimiter`
   - Injetar headers `RateLimit-*`
   - Se `!rateResult.allowed`: retornar HTTP 429 com JSON estruturado e header `Retry-After`.

- [ ] **Step 4: Executar testes e verificar aprovação (PASS)**

Executar: `& 'C:\Program Files\nodejs\node.exe' --test test/server-rate-limit.test.js`
Esperado: PASS.

---

### Task 3: Camada de Nuvem para Supabase Edge Functions (`_shared/rate-limiter.ts`)

**Files:**
- Create: `code_sandbox_light_git_fe61910d_1781185357/supabase/functions/_shared/rate-limiter.ts`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/supabase/functions/sign-in/index.ts`
- Modify: `code_sandbox_light_git_fe61910d_1781185357/supabase/functions/enviar-bpa-email/index.ts`
- Test: `test/edge-rate-limiter.test.js`

- [ ] **Step 1: Criar helper Deno `_shared/rate-limiter.ts`**
- [ ] **Step 2: Aplicar rate limit em `sign-in/index.ts` e `enviar-bpa-email/index.ts`**
- [ ] **Step 3: Escrever e rodar teste unitário para o helper de nuvem**

Executar: `& 'C:\Program Files\nodejs\node.exe' --test test/edge-rate-limiter.test.js`
Esperado: PASS.

---

### Task 4: Suíte Geral de Verificação e Regressão

**Files:**
- Test: `test/` (todos os testes da suíte)

- [ ] **Step 1: Executar suíte completa de testes automatizados**

Executar: `& 'C:\Program Files\nodejs\node.exe' --test test/*.test.js`
Esperado: 100% de aprovação.

- [ ] **Step 2: Verificar health check do servidor com simulação real de proxy**
