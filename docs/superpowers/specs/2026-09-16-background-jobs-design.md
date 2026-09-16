# Especificação Técnica — Background Jobs & Processamento Não-Bloqueante no FPA-ARGOS

- **Data:** 16 de Setembro de 2026
- **Status:** Validado
- **Escopo:** Sub-projeto 3 da iniciativa de modernização e robustez (Rate Limiting, Índices de Banco, Background Jobs, Observabilidade).
- **Alvo:** Servidor Node.js (`server.js`), Fila de Tarefas em Segundo Plano (`lib/job-queue.js`) e Motor Não-Bloqueante em Lotes (`lib/chunked-processor.js`).

---

## 1. Contexto e Problema

No ecossistema do **FPA-ARGOS**, duas operações exigem alto custo de processamento e tempo de espera:
1. **Disparo de E-mails com Anexos Pesados (BPA/TXT):** 
   - A comunicação síncrona via SMTP/TLS ou Resend API mantém a conexão HTTP suspensa por até 30 segundos.
   - Isso bloqueia o usuário na interface, causa timeouts de rede, duplicação acidental de disparos e risco de banimento de IP no Google por múltiplas conexões simultâneas concorrentes.
2. **Processamento de Grandes Arquivos BPA na Interface:**
   - Arquivos BPA com dezenas de milhares de registros são lidos e processados em loops síncronos na thread principal do navegador.
   - Isso congela a interface do usuário (alerta *"Esta página não está respondendo"*) e expõe rotinas recursivas ao risco de estouro de pilha (*Call Stack Overflow* — `RangeError: Maximum call stack size exceeded`).

O objetivo deste projeto é introduzir uma **Fila de Background Jobs com Concorrência Controlada** no backend e um **Processador em Lotes Não-Bloqueante (*Chunked Processor*)** no frontend e backend.

---

## 2. Arquitetura da Fila de Background Jobs (`lib/job-queue.js`)

### 2.1 Modelo de Dados do Job
Cada tarefa possui a seguinte estrutura:
- `id`: `job_${Date.now()}_${random}`
- `type`: String identificando a tarefa (ex: `'enviar_email_bpa'`)
- `payload`: Objeto com os dados de entrada
- `status`: `'QUEUED'` | `'RUNNING'` | `'COMPLETED'` | `'FAILED'`
- `progress`: Número de 0 a 100
- `attempts`: Contador de tentativas executadas
- `maxAttempts`: Número máximo de tentativas (padrão: 3)
- `result`: Retorno com dados de sucesso
- `error`: Mensagem de erro caso todas as tentativas falhem
- `createdAt`, `startedAt`, `completedAt`: Timestamps

### 2.2 Gerenciamento de Concorrência
- Concorrência máxima padrão: **2 jobs simultâneos**.
- Se mais jobs forem enfileirados, eles aguardam com status `'QUEUED'`.
- Ao finalizar um job ativo, o despachante (*dispatcher*) retira o próximo item da fila e o inicia imediatamente.

### 2.3 Mecanismo de Retry com Backoff Exponencial
- Se um job falhar com erro recuperável (ex: falha de rede SMTP), ele é re-enfileirado com atraso calculado:
  `delay = Math.min(30000, 1000 * Math.pow(2, attempts))` (ex: 2s, 4s, 8s).
- Apenas se `attempts >= maxAttempts`, o status muda definitivamente para `'FAILED'`.

### 2.4 Gestão de Memória e Expurgador
- Jobs finalizados (`COMPLETED` ou `FAILED`) permanecem em memória por 1 hora (`retentionMs = 3600000`) para que clientes HTTP possam consultar o status via polling.
- Um temporizador periódico com `.unref()` remove jobs com idade superior a 1 hora.

---

## 3. Endpoints REST da Fila de Jobs (`server.js`)

1. **`POST /api/jobs/enviar-email`**:
   - Responde em < 15ms com status `HTTP 202 Accepted`:
   ```json
   {
     "success": true,
     "status": "QUEUED",
     "jobId": "job_1726490000_abc123",
     "message": "Disparo de e-mail enfileirado para processamento em segundo plano.",
     "checkUrl": "/api/jobs/job_1726490000_abc123"
   }
   ```
2. **`GET /api/jobs/:id`**:
   - Retorna o status e progresso em tempo real:
   ```json
   {
     "success": true,
     "job": {
       "id": "job_1726490000_abc123",
       "type": "enviar_email_bpa",
       "status": "COMPLETED",
       "progress": 100,
       "attempts": 1,
       "result": { "delivered": true, "method": "smtp", "destinatario": "auditoriabacabal@gmail.com" }
     }
   }
   ```
3. **`GET /api/jobs`**:
   - Retorna a lista dos últimos 50 jobs para auditoria.

---

## 4. Motor de Lotes Não-Bloqueante (`lib/chunked-processor.js`)

Para eliminar o risco de travamento de interface e estouro de pilha recursiva:
- Função utilitária `processInChunks(items, processItemFn, options)`:
  - Fatiamento em blocos (`chunkSize = 2000`).
  - Pausa cooperativa a cada fatia: `await new Promise(r => setTimeout(r, 0))` (ou `setImmediate` no Node.js).
  - Emissão de progresso: `options.onProgress(percentual)`.
  - Isomórfico: roda no navegador e no Node.js.

---

## 5. Estratégia de Testes Automatizados (TDD)

1. **Unitário da Fila (`test/job-queue.test.js`):**
   - Enfileiramento, concorrência máxima de 2, emissão de progresso e retries.
2. **Unitário do Processador (`test/chunked-processor.test.js`):**
   - Processamento de 10.000 itens sem bloquear a pilha e com emissão de progresso.
3. **Integração HTTP (`test/server-jobs.test.js`):**
   - Criação via `POST /api/jobs/enviar-email` e acompanhamento via `GET /api/jobs/:id` até conclusão.
