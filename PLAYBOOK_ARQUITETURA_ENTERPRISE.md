# Playbook de Arquitetura Enterprise & Alta Performance
> **Guia Definitivo e Reutilizável de Engenharia de Software para Modernização e Novos Sistemas.**
> Aplicável a arquiteturas Node.js (v18+ / v20+ / v24+), PostgreSQL / Supabase e Frontends Modernos.

---

## Sumário Executivo
Este guia consolida o padrão de engenharia corporativo implementado no **FPA-ARGOS**, projetado para garantir:
1. **Segurança e Resiliência contra Abuso** (Rate Limiting multi-nível e proteção de borda).
2. **Performance Extrema de Banco de Dados** (Estratégia de 5 categorias de índices PostgreSQL).
3. **Desacoplamento e Não-Bloqueio de Event Loop** (Fila de Jobs assíncrona e processamento em lotes).
4. **Observabilidade e Conformidade** (Correlation IDs ponta a ponta e auditoria com sanitização estrita).
5. **Experiência do Usuário (UX) & Otimização de Rede** (Compressão nativa Gzip, Debounce e Skeleton Screens Shimmer).
6. **Zero Dependências Externas Desnecessárias** (Utilização máxima de APIs nativas do Node.js: `node:zlib`, `node:test`, `node:crypto`, `node:events`).

---

## 1. Princípios Fundamentais de Design

| Princípio | Regra Prática |
| :--- | :--- |
| **Zero Bloqueio do Event Loop** | Nenhuma iteração síncrona sobre grandes conjuntos de dados (> 1.000 itens) deve rodar de forma contínua. Usar fatiamento cooperativo com `setImmediate()`. |
| **Fail Fast & Graceful Degradation** | Tarefas lentas (e-mails, relatórios, integrações externas) devem responder `HTTP 202 Accepted` de imediato e rodar em segundo plano. |
| **Defesa em Profundidade** | Rate limiting aplicado na borda (Edge / CDN / Cloud Functions) e no servidor de aplicação. |
| **Sanitização de Dados em Repouso** | Nenhuma senha, token ou chave de API pode trafegar para logs ou persistência de auditoria em texto claro. |
| **Zero Dependências Frágeis** | Privilegiar módulos nativos (`node:zlib`, `node:crypto`, `node:test`) em vez de pacotes npm de utilitários triviais. |

---

## 2. Módulo 1: Rate Limiting & Proteção de Tráfego

### 2.1. Arquitetura do Algoritmo Sliding Window
Diferente do *Fixed Window* (que permite rajadas na virada do minuto), a **Janela Deslizante Ponderada (Sliding Window Counter)** calcula a taxa ponderando as requisições da janela anterior com a atual:

$$\text{Taxa Estimada} = (\text{Contagem Anterior} \times (1 - \text{Fração da Janela Atual})) + \text{Contagem Atual}$$

### 2.2. Implementação do Core (`lib/rate-limiter.js`)
```javascript
/**
 * SlidingWindowRateLimiter - Zero dependências.
 */
class SlidingWindowRateLimiter {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60000;
        this.cleanupIntervalMs = options.cleanupIntervalMs || 120000;
        this.hits = new Map();

        // Limpeza periódica unref para não segurar o processo do Node
        this.timer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
        if (this.timer.unref) this.timer.unref();
    }

    getClientIp(req) {
        const xff = req.headers['x-forwarded-for'];
        if (xff) return xff.split(',')[0].trim();
        const xReal = req.headers['x-real-ip'];
        if (xReal) return xReal.trim();
        let ip = req.socket?.remoteAddress || '127.0.0.1';
        if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
        if (ip === '::1') ip = '127.0.0.1';
        return ip;
    }

    check(key, limit) {
        const now = Date.now();
        const currentWindow = Math.floor(now / this.windowMs);
        const windowOffset = (now % this.windowMs) / this.windowMs;

        let entry = this.hits.get(key);
        if (!entry) {
            entry = { prevWindow: 0, prevCount: 0, currWindow: currentWindow, currCount: 0, lastSeen: now };
            this.hits.set(key, entry);
        } else {
            entry.lastSeen = now;
            if (entry.currWindow !== currentWindow) {
                if (entry.currWindow === currentWindow - 1) {
                    entry.prevWindow = entry.currWindow;
                    entry.prevCount = entry.currCount;
                } else {
                    entry.prevWindow = 0;
                    entry.prevCount = 0;
                }
                entry.currWindow = currentWindow;
                entry.currCount = 0;
            }
        }

        const estimatedCount = Math.floor(entry.prevCount * (1 - windowOffset)) + entry.currCount;

        if (estimatedCount >= limit) {
            const resetSeconds = Math.ceil((this.windowMs - (now % this.windowMs)) / 1000);
            return {
                allowed: false,
                limit,
                remaining: 0,
                retryAfterSeconds: Math.max(1, resetSeconds),
                resetSeconds: Math.max(1, resetSeconds)
            };
        }

        entry.currCount++;
        return {
            allowed: true,
            limit,
            remaining: Math.max(0, limit - (estimatedCount + 1)),
            retryAfterSeconds: 0,
            resetSeconds: Math.ceil((this.windowMs - (now % this.windowMs)) / 1000)
        };
    }

    cleanup() {
        const now = Date.now();
        const expiry = this.windowMs * 2;
        for (const [key, entry] of this.hits.entries()) {
            if (now - entry.lastSeen > expiry) {
                this.hits.delete(key);
            }
        }
    }
}

module.exports = SlidingWindowRateLimiter;
```

### 2.3. Matriz de Políticas por Tier (RFC 6585)
No `server.js`, classifique as rotas em tiers:
* **Tier 1 (Ações Críticas / Disparo de E-mails / Auth):** 5 req / 60s.
* **Tier 2 (Persistência / Criação / Atualização em BD):** 15 req / 60s.
* **Tier 3 (Proxies e APIs Externas):** 60 req / 60s.
* **Tier 4 (Consultas Gerais e Arquivos Estáticos):** 300 req / 60s.

Sempre injetar os cabeçalhos padrão:
* `RateLimit-Limit: <limite>`
* `RateLimit-Remaining: <restante>`
* `RateLimit-Reset: <segundos>`
* Em caso de bloqueio: `HTTP 429 Too Many Requests` com `Retry-After: <segundos>`.

---

## 3. Módulo 2: Otimização de Banco de Dados (PostgreSQL / Supabase)

### 3.1. Estratégia dos 5 Tipos de Índices
Toda migração em novos sistemas deve cobrir:
1. **Chaves Estrangeiras (FK):** O Postgres **não** cria índices automáticos em FKs; sem eles, qualquer `JOIN` ou `DELETE CASCADE` causa Full Table Scan.
2. **Índices Compostos por Frequência:** Colunas que aparecem juntas em cláusulas `WHERE`, `ORDER BY` ou `GROUP BY`.
3. **Índices Parciais (`WHERE` condicional):** Indexam apenas um subconjunto de linhas ativas ou pendentes, reduzindo o tamanho do índice em até 95%.
4. **Índices GIN para JSONB:** Essenciais para dados semiestruturados, usando o operador otimizado `jsonb_path_ops`.
5. **Índices B-Tree Textuais:** Colunas de busca textual frequente (`nome`, `descricao`).

### 3.2. Script SQL Padrão Idempotente
```sql
-- 1. CHAVES ESTRANGEIRAS
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido_id ON itens_pedido(pedido_id);

-- 2. ÍNDICES COMPOSTOS COM ORDENAÇÃO
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_data 
ON pedidos(cliente_id, data_pedido DESC);

-- 3. ÍNDICES PARCIAIS (ALTO DESEMPENHO)
-- Indexa apenas registros pendentes ou que requerem processamento
CREATE INDEX IF NOT EXISTS idx_pedidos_pendentes 
ON pedidos(status, criado_em DESC) 
WHERE status IN ('PENDENTE', 'ERRO');

-- 4. ÍNDICES GIN PARA DADOS JSONB
CREATE INDEX IF NOT EXISTS idx_logs_payload_gin 
ON logs_sistema USING gin (payload jsonb_path_ops);

-- 5. ÍNDICES TEXTUAIS PARA BUSCA
CREATE INDEX IF NOT EXISTS idx_usuarios_nome 
ON usuarios(nome);
```

---

## 4. Módulo 3: Fila de Background Jobs & Anti-Recursão

### 4.1. Processador em Lotes Cooperativo (`lib/chunked-processor.js`)
Evita travamento de CPU e estouro de memória ao iterar grandes volumes de dados (ex.: relatórios, arquivos magnéticos ou conciliações):

```javascript
/**
 * Processa coleções em lotes cooperativos, liberando o Event Loop entre fatias.
 */
async function processInChunks(items, handler, options = {}) {
    if (!Array.isArray(items)) throw new TypeError('items deve ser um Array');
    if (items.length === 0) return [];

    const chunkSize = options.chunkSize || 1000;
    const onProgress = options.onProgress || null;
    const results = [];
    const total = items.length;

    for (let i = 0; i < total; i += chunkSize) {
        const slice = items.slice(i, i + chunkSize);
        for (const item of slice) {
            results.push(await handler(item));
        }

        if (onProgress) {
            onProgress({
                processed: Math.min(i + chunkSize, total),
                total,
                percentage: Math.round((Math.min(i + chunkSize, total) / total) * 100)
            });
        }

        // Cede o controle ao Event Loop para processar I/O pendente
        await new Promise(resolve => setImmediate(resolve));
    }

    return results;
}

module.exports = { processInChunks };
```

### 4.2. Fila Assíncrona com Concorrência Limitada (`lib/job-queue.js`)
```javascript
const { EventEmitter } = require('events');

class JobQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        this.concurrency = options.concurrency || 2;
        this.maxAttempts = options.maxAttempts || 3;
        this.queue = [];
        this.runningCount = 0;
        this.jobs = new Map();
    }

    add(type, payload, options = {}) {
        const id = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const job = {
            id,
            type,
            payload,
            status: 'QUEUED', // QUEUED, RUNNING, COMPLETED, FAILED
            attempts: 0,
            maxAttempts: options.maxAttempts || this.maxAttempts,
            correlationId: options.correlationId || null,
            result: null,
            error: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.jobs.set(id, job);
        this.queue.push(job);
        setImmediate(() => this._processNext());
        return job;
    }

    async _processNext() {
        if (this.runningCount >= this.concurrency || this.queue.length === 0) return;

        const job = this.queue.shift();
        this.runningCount++;
        job.status = 'RUNNING';
        job.attempts++;
        job.updatedAt = new Date().toISOString();

        try {
            // Emite evento para que o executor registre o resultado
            const result = await this.executor(job);
            job.status = 'COMPLETED';
            job.result = result;
        } catch (err) {
            if (job.attempts < job.maxAttempts) {
                job.status = 'RETRYING';
                // Backoff exponencial antes de reinserir
                const delay = Math.pow(2, job.attempts) * 500;
                setTimeout(() => {
                    this.queue.push(job);
                    this._processNext();
                }, delay);
            } else {
                job.status = 'FAILED';
                job.error = err.message || String(err);
            }
        } finally {
            this.runningCount--;
            job.updatedAt = new Date().toISOString();
            setImmediate(() => this._processNext());
        }
    }
}
```

### 4.3. Padrão de API REST para Jobs em Segundo Plano
1. `POST /api/jobs/<acao>`: Enfileira a tarefa e responde **imediatamente**:
   ```json
   HTTP 202 Accepted
   {
     "status": "ACCEPTED",
     "jobId": "job_1726498123_a8b9c",
     "message": "Tarefa agendada para processamento em segundo plano.",
     "statusUrl": "/api/jobs/job_1726498123_a8b9c"
   }
   ```
2. `GET /api/jobs/:id`: Permite à interface consultar o progresso via polling leve a cada 2 ou 3 segundos.

---

## 5. Módulo 4: Observabilidade, Correlation IDs e Auditoria

### 5.1. Propagação de Correlation ID (`x-request-id`)
Toda requisição HTTP recebida deve:
1. Respeitar o cabeçalho `x-request-id` enviado pelo frontend (se existir).
2. Se ausente, gerar um ID exclusivo: `req_<timestamp>_<randomHex>`.
3. Injetar o cabeçalho `x-request-id` na resposta HTTP.
4. Passar esse mesmo ID para os logs, para a fila de background jobs e para o arquivo de auditoria.

### 5.2. Logger Estruturado JSON (`lib/logger.js`)
```javascript
class StructuredLogger {
    constructor(options = {}) {
        this.service = options.service || 'app-service';
        this.minLevel = options.minLevel || 'INFO';
        this.levels = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
    }

    log(level, message, meta = {}) {
        if (this.levels[level] < this.levels[this.minLevel]) return;

        const entry = {
            timestamp: new Date().toISOString(),
            service: this.service,
            level,
            correlationId: meta.correlationId || 'none',
            message,
            ...meta
        };

        const json = JSON.stringify(entry);
        if (level === 'ERROR') {
            console.error(json);
        } else {
            console.log(json);
        }
    }
}
```

### 5.3. Trilha de Auditoria com Sanitização Estrita (`lib/audit-logger.js`)
```javascript
const SENSITIVE_KEYS = [
    'password', 'senha', 'token', 'apikey', 'secret', 
    'authorization', 'bearer', 'cvv', 'card_number'
];

function sanitizeDeep(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeDeep);

    const safe = {};
    for (const [key, val] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))) {
            safe[key] = '[REDACTED]';
        } else if (typeof val === 'object' && val !== null) {
            safe[key] = sanitizeDeep(val);
        } else {
            safe[key] = val;
        }
    }
    return safe;
}
```

---

## 6. Módulo 5: Pacote de Alta Performance de Rede e Frontend

### 6.1. Compressão HTTP Nativa Gzip / Deflate (`lib/compression.js`)
* Comprime buffers acima de 1 KB para tipos textuais/JSON.
* Reduz assets volumosos em **80% a 90%** sem bibliotecas externas:

```javascript
const zlib = require('zlib');

function compressBuffer(buffer, acceptEncoding = '') {
    const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''), 'utf8');
    const enc = (acceptEncoding || '').toLowerCase();

    if (enc.includes('gzip')) {
        return { encoding: 'gzip', data: zlib.gzipSync(raw, { level: 6 }) };
    }
    if (enc.includes('deflate')) {
        return { encoding: 'deflate', data: zlib.deflateSync(raw, { level: 6 }) };
    }
    return { encoding: null, data: raw };
}
```

### 6.2. Debounce para Inputs de Busca e Filtros
Impede que cada digitação do usuário dispare recomputações caras na DOM ou requisições na rede:

```javascript
function debounce(fn, delayMs = 300) {
    let timeoutId = null;
    function debounced(...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            timeoutId = null;
            fn.apply(this, args);
        }, delayMs);
    }
    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };
    return debounced;
}
```

### 6.3. Skeleton Screens Shimmer (Anti-CLS)
Substitui telas em branco ou spinners intrusivos por esqueletos com animação contínua, preservando as dimensões exatas dos cards e tabelas:

```css
@keyframes argos-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}

.skeleton-shimmer {
    background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
    background-size: 200% 100%;
    animation: argos-shimmer 1.5s infinite ease-in-out;
    border-radius: 6px;
}

.skeleton-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
```

---

## 7. Módulo 6: Suíte de Testes Automatizados (Node.js Native Runner)

Elimine Jest/Mocha em ambientes que requerem máxima velocidade e zero manutenção de dependências:
* Use o runner nativo: `node --test test/*.test.js`.
* Em testes HTTP com subida de servidores paralelos, utilize **portas dinâmicas ou exclusivas por arquivo de teste** para evitar `EADDRINUSE`.

### Template de Teste Nativo (`test/sample.test.js`)
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('Sample Suite - Deve validar comportamento esperado', async (t) => {
    await t.test('sub-caso de sucesso', () => {
        const valor = 10;
        assert.equal(valor, 10);
    });

    await t.test('sub-caso de erro controlado', () => {
        assert.throws(() => {
            throw new Error('Falha simulada');
        }, /Falha simulada/);
    });
});
```

---

## 8. Checklist de Implementação para Novos Sistemas (Definition of Done)

Copie e cole este checklist no início de cada novo projeto:

```markdown
### Checklist de Entrega Enterprise
- [ ] 1. Rate Limiting implementado no backend com Sliding Window e cabeçalhos RFC 6585.
- [ ] 2. Proteção de taxa adicionada nas Edge Functions / Autenticação.
- [ ] 3. Migração SQL criada com CREATE INDEX IF NOT EXISTS (FKs, parciais, compostos e GIN).
- [ ] 4. Funções lentas migradas para JobQueue (HTTP 202) e loops grandes com processInChunks.
- [ ] 5. Middleware de Correlation ID (x-request-id) injetado no request e response.
- [ ] 6. Logger estruturado JSON e auditoria com sanitização profunda de senhas/tokens.
- [ ] 7. Compressão Gzip/Deflate nativa ativada para payloads JSON e assets estáticos.
- [ ] 8. Debounce aplicado em todos os campos de busca e filtros de tabela.
- [ ] 9. Skeleton Screens Shimmer aplicados nos estados de carregamento assíncrono.
- [ ] 10. Suíte de testes automatizados com node:test rodando 100% verde (sem falhas).
```

---
*Playbook consolidado e validado em produção — FPA-ARGOS Enterprise Engineering.*
