# Background Jobs & Processamento Não-Bloqueante — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar fila de background jobs nativa com concorrência controlada e retries no `server.js`, juntamente com um motor de processamento em lotes não-bloqueante (*Chunked Processor*) para eliminar travamento de tela e estouros de pilha recursivos no FPA-ARGOS.

**Architecture:** Módulo `lib/job-queue.js` desacoplando requisições HTTP do tempo de envio de e-mails/cálculos pesados com estados (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`), concorrência máxima de 2 jobs e endpoints REST (`/api/jobs/*`). Módulo `lib/chunked-processor.js` dividindo coleções grandes em lotes cooperativos.

**Tech Stack:** Node.js (v24 nativo, `node:test`, `node:assert/strict`, `EventEmitter`, `http`), JavaScript isomórfico.

**Spec:** [docs/superpowers/specs/2026-09-16-background-jobs-design.md](file:///c:/Users/Controle/.gemini/antigravity-ide/scratch/FPA-ARGOS/docs/superpowers/specs/2026-09-16-background-jobs-design.md)

## Global Constraints

- Zero dependências npm adicionais no servidor Node.js (`lib/job-queue.js` e `lib/chunked-processor.js` devem usar apenas APIs nativas do Node.js/JavaScript).
- Concorrência máxima padrão de 2 jobs simultâneos para evitar sobrecarga de conexão SMTP ou banimento por spam.
- Mecanismo de até 3 tentativas automáticas (*retries*) com *backoff* exponencial para falhas de rede.
- Retorno HTTP 202 Accepted no enfileiramento com `jobId` e `checkUrl`.
- Retenção de memória de 1 hora para jobs finalizados com expurgo automático (`.unref()`).
- Processamento em lotes (*chunks*) com pausa cooperativa (`setTimeout(0)` / `setImmediate`) para garantir 60fps na UI e zero risco de *Maximum call stack size exceeded*.

---

## File Structure

```
FPA-ARGOS/
├── lib/
│   ├── job-queue.js             # [NEW] Módulo core da fila de background jobs
│   └── chunked-processor.js     # [NEW] Processador de lotes cooperativos anti-recursão
├── server.js                    # [MODIFY] Rotas REST /api/jobs/* e handler de e-mail em background
└── test/
    ├── job-queue.test.js        # [NEW] Testes unitários da fila de jobs (TDD)
    ├── chunked-processor.test.js# [NEW] Testes unitários do chunked processor
    └── server-jobs.test.js      # [NEW] Testes de integração HTTP para /api/jobs
```

---

### Task 1: Módulo Core `lib/job-queue.js`

**Files:**
- Create: `lib/job-queue.js`
- Test: `test/job-queue.test.js`

**Interfaces:**
- Consumes: `node:events` (`EventEmitter`).
- Produces: `class JobQueue` com métodos:
  - `registerHandler(type, fn): void`
  - `enqueue(type, payload, options): Job`
  - `getJob(id): Job | null`
  - `listJobs(limit): Job[]`
  - `cleanup(retentionMs): number`
  - `destroy(): void`

- [ ] **Step 1: Escrever teste unitário automatizado (RED)**

Criar `test/job-queue.test.js`:
```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JobQueue } = require('../lib/job-queue');

describe('JobQueue Core', () => {
    let queue;

    beforeEach(() => {
        queue = new JobQueue({ concurrency: 2, retentionMs: 10000 });
    });

    afterEach(() => {
        if (queue) queue.destroy();
    });

    test('enfileira e executa jobs com sucesso', async () => {
        queue.registerHandler('test_task', async (job, updateProgress) => {
            updateProgress(50);
            return { processed: true, value: job.payload.val * 2 };
        });

        const job = queue.enqueue('test_task', { val: 21 });
        assert.equal(job.status, 'QUEUED');
        assert.ok(job.id);

        await new Promise((resolve) => queue.on('job:complete', (completed) => {
            if (completed.id === job.id) resolve();
        }));

        const resultJob = queue.getJob(job.id);
        assert.equal(resultJob.status, 'COMPLETED');
        assert.equal(resultJob.progress, 100);
        assert.equal(resultJob.result.value, 42);
    });

    test('respeita a concorrência máxima de 2 jobs simultâneos', async () => {
        let active = 0;
        let maxObserved = 0;

        queue.registerHandler('slow_task', async () => {
            active++;
            maxObserved = Math.max(maxObserved, active);
            await new Promise((r) => setTimeout(r, 40));
            active--;
            return true;
        });

        const j1 = queue.enqueue('slow_task', {});
        const j2 = queue.enqueue('slow_task', {});
        const j3 = queue.enqueue('slow_task', {});

        await Promise.all([
            new Promise(r => queue.on('job:complete', j => j.id === j1.id && r())),
            new Promise(r => queue.on('job:complete', j => j.id === j2.id && r())),
            new Promise(r => queue.on('job:complete', j => j.id === j3.id && r()))
        ]);

        assert.equal(maxObserved, 2, 'Concorrência máxima não deve exceder 2');
    });

    test('re-tenta falhas transitórias até maxAttempts', async () => {
        let callCount = 0;
        queue.registerHandler('failing_task', async () => {
            callCount++;
            if (callCount < 2) throw new Error('Erro temporário');
            return 'sucesso_no_retry';
        });

        const job = queue.enqueue('failing_task', {}, { maxAttempts: 3, retryDelayMs: 20 });

        await new Promise((resolve) => queue.on('job:complete', (completed) => {
            if (completed.id === job.id) resolve();
        }));

        const resultJob = queue.getJob(job.id);
        assert.equal(resultJob.status, 'COMPLETED');
        assert.equal(resultJob.attempts, 2);
    });
});
```

- [ ] **Step 2: Executar teste para confirmar falha (RED)**

Executar: `& 'C:\Program Files\nodejs\node.exe' --test test/job-queue.test.js`
Esperado: FAIL com `Cannot find module '../lib/job-queue'`.

- [ ] **Step 3: Implementar `lib/job-queue.js` (GREEN)**

- [ ] **Step 4: Executar teste e validar 100% PASS**

---

### Task 2: Módulo `lib/chunked-processor.js` (Anti-Recursão & Anti-Freeze)

**Files:**
- Create: `lib/chunked-processor.js`
- Test: `test/chunked-processor.test.js`

**Interfaces:**
- Produces: `async function processInChunks(items, itemHandler, options): Promise<any[]>`

- [ ] **Step 1: Escrever teste unitário (RED)**

Criar `test/chunked-processor.test.js`:
```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { processInChunks } = require('../lib/chunked-processor');

describe('ChunkedProcessor', () => {
    test('processa 10.000 itens em lotes sem bloquear a pilha e reporta progresso', async () => {
        const data = Array.from({ length: 10000 }, (_, i) => i);
        const progressReports = [];

        const results = await processInChunks(data, (item) => item * 2, {
            chunkSize: 2000,
            onProgress: (pct) => progressReports.push(pct)
        });

        assert.equal(results.length, 10000);
        assert.equal(results[9999], 19998);
        assert.ok(progressReports.length >= 5);
        assert.equal(progressReports[progressReports.length - 1], 100);
    });
});
```

- [ ] **Step 2: Executar teste para confirmar falha (RED)**
- [ ] **Step 3: Implementar `lib/chunked-processor.js` (GREEN)**
- [ ] **Step 4: Executar teste e validar 100% PASS**

---

### Task 3: Integração no Servidor Node.js (`server.js`)

**Files:**
- Modify: `server.js`
- Test: `test/server-jobs.test.js`

**Interfaces:**
- Consumes: `JobQueue` de `lib/job-queue.js`.
- Produces: Rotas `/api/jobs/enviar-email`, `/api/jobs/:id`, `/api/jobs`.

- [ ] **Step 1: Escrever teste de integração HTTP (RED)**

Criar `test/server-jobs.test.js`:
```javascript
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('Server Background Jobs API Integration', () => {
    const TEST_PORT = 3899;
    let serverInstance;

    before((t, done) => {
        process.env.PORT = String(TEST_PORT);
        const mod = require('../server.js');
        serverInstance = mod.server;
        setTimeout(done, 500);
    });

    after((t, done) => {
        if (serverInstance && serverInstance.close) serverInstance.close(done);
        else done();
    });

    test('POST /api/jobs/enviar-email responde HTTP 202 Accepted imediatamente e enfileira job', async () => {
        const res = await fetch(`http://localhost:${TEST_PORT}/api/jobs/enviar-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinatario: 'teste@exemplo.com', assunto: 'Teste Fila' })
        });

        assert.equal(res.status, 202);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.status, 'QUEUED');
        assert.ok(body.jobId);
        assert.ok(body.checkUrl);

        // Checa status via GET /api/jobs/:id
        const resStatus = await fetch(`http://localhost:${TEST_PORT}/api/jobs/${body.jobId}`);
        assert.equal(resStatus.status, 200);
        const bodyStatus = await resStatus.json();
        assert.ok(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'].includes(bodyStatus.job.status));
    });
});
```

- [ ] **Step 2: Executar teste de integração para confirmar falha (RED)**
- [ ] **Step 3: Integrar rotas `/api/jobs/*` e handler em `server.js` (GREEN)**
- [ ] **Step 4: Executar testes de integração e validar 100% PASS**

---

### Task 4: Suíte Geral de Verificação e Regressão

- [ ] **Step 1: Executar suíte completa de testes automatizados**
  `& 'C:\Program Files\nodejs\node.exe' --test test/*.test.js`
- [ ] **Step 2: Validar ausência de vazamento de memória e encerramento gracioso**
