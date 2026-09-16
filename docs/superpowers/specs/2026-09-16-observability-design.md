# Especificação Técnica — Observabilidade & Trilha de Auditoria no FPA-ARGOS

- **Data:** 16 de Setembro de 2026
- **Status:** Proposto para Validação
- **Escopo:** Sub-projeto 4 da iniciativa de modernização e robustez (Rate Limiting, Índices de Banco, Background Jobs, Observabilidade).
- **Alvo:** Módulo Core de Logs Estruturados (`lib/logger.js`), Módulo de Auditoria (`lib/audit-logger.js`) e Integração no `server.js` e `JobQueue`.

---

## 1. Contexto e Objetivos

Com a adição de **Rate Limiting**, **Processamento em Lotes Não-Bloqueante** e **Background Jobs**, o fluxo de requisições e tarefas no FPA-ARGOS tornou-se assíncrono e desacoplado. Para garantir diagnósticos imediatos, rastreabilidade ponta a ponta e auditoria de conformidade SUS:

1. **Correlation ID Unificado (`x-request-id`):** Rastrear cada requisição HTTP desde a entrada no servidor até os workers em segundo plano e respostas finais.
2. **Logs Estruturados em JSON:** Eliminar `console.log` dispersos e padronizar saídas em JSON com campos fixos (`timestamp`, `level`, `correlationId`, `service`, `event`, `durationMs`, `meta`).
3. **Trilha de Auditoria Crítica (Audit Trail):** Registrar formalmente ações sensíveis (disparo de e-mails, mutações de dados do CNES, consultas a dados sigilosos e alterações de configuração) compatível com a tabela `historico_acoes` do Supabase e persistência local resiliente em `logs/audit.log`.

---

## 2. Arquitetura do Logger Estruturado (`lib/logger.js`)

### 2.1 Estrutura do Objeto de Log
Cada linha de log é um JSON serializado contendo:
```json
{
  "timestamp": "2026-09-16T13:35:00.123Z",
  "level": "INFO",
  "service": "fpa-argos",
  "correlationId": "req_1726493700_x8f19a",
  "event": "http_request_completed",
  "method": "POST",
  "path": "/api/jobs/enviar-email",
  "statusCode": 202,
  "durationMs": 4.2,
  "ip": "127.0.0.1",
  "meta": {}
}
```

### 2.2 Níveis de Log
- `DEBUG`: Detalhes de diagnóstico em desenvolvimento.
- `INFO`: Operações normais (início de jobs, conclusão de requisições).
- `WARN`: Incidentes recuperáveis (retries de SMTP, acionamento de rate limit).
- `ERROR`: Falhas não recuperadas e exceções com stack trace estruturado.

---

## 3. Módulo de Trilha de Auditoria (`lib/audit-logger.js`)

### 3.1 Modelo de Evento de Auditoria
Alinhado à tabela `historico_acoes` e aos requisitos de conformidade do DATASUS/FNS:
- `id`: Identificador único do evento (`evt_...`)
- `correlationId`: ID de correlação da requisição de origem
- `usuarioLogin`: Operador ou sistema responsável (ex: `'admin'`, `'auditoria'`)
- `modulo`: Módulo afetado (`'BPA'`, `'CNES'`, `'CONFIG_EMAIL'`, `'FNS_PROXY'`)
- `acao`: Ação executada (`'ENVIO_EMAIL_BPA'`, `'ALTERACAO_CONFIG'`, `'EXPORTACAO_DADOS'`)
- `detalhes`: Objeto JSON com parâmetros da operação (sem vazar senhas/tokens)
- `ip`: IP do solicitante
- `status`: `'SUCESSO'` | `'FALHA'`
- `timestamp`: Timestamp ISO 8601

### 3.2 Persistência
- Gravação assíncrona em append-only file: `logs/audit.log` com rotação ou buffer não-bloqueante.
- Fallback em memória caso o disco esteja temporariamente inacessível.

---

## 4. Integração no `server.js`

1. **Middleware de Correlação & Acesso:**
   - Lê cabeçalho `x-request-id` ou gera novo `req_${Date.now()}_${random}`.
   - Devolve `x-request-id` no cabeçalho de resposta.
   - Mede tempo de resposta e emite log estruturado `http_request_completed`.
2. **Propagação para Background Jobs:**
   - Ao criar o job em `/api/jobs/enviar-email`, repassa o `correlationId` no payload do job.
   - Os eventos de ciclo de vida (`job:started`, `job:complete`, `job:failed`, `job:retry`) registram o `correlationId` para rastreamento correlacionado.
3. **Auditoria de Eventos Sensíveis:**
   - Emite registros formais de auditoria ao concluir o envio de e-mails ou alterar configurações.

---

## 5. Estratégia de Testes Automatizados (TDD)

1. `test/logger.test.js`:
   - Validação de formato JSON, níveis de severidade, medição de duração e tratamento de erros.
2. `test/audit-logger.test.js`:
   - Validação de mascaramento de credenciais em `detalhes` (ex: nunca gravar `smtp_pass` ou `resend_api_key`).
   - Gravação de evento e leitura estruturada.
3. `test/server-observability.test.js`:
   - Validação da injeção do header `x-request-id`.
   - Verificação de que requisições geram logs com `correlationId` e métricas de latência.
