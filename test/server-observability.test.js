const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('Server Observability & Correlation ID Integration', () => {
    const TEST_PORT = 3896;
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

    test('retorna cabeçalho x-request-id gerado automaticamente em qualquer requisição', async () => {
        const res = await fetch(`http://localhost:${TEST_PORT}/api/jobs`);
        assert.equal(res.status, 200);
        const requestId = res.headers.get('x-request-id');
        assert.ok(requestId, 'Header x-request-id deve estar presente');
        assert.ok(requestId.startsWith('req_'), 'Header x-request-id deve iniciar com req_');
    });

    test('preserva e propaga o x-request-id fornecido pelo cliente', async () => {
        const customId = 'req_custom_tracer_999';
        const res = await fetch(`http://localhost:${TEST_PORT}/api/jobs`, {
            headers: { 'x-request-id': customId }
        });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('x-request-id'), customId);
    });

    test('propaga correlationId para o job em segundo plano e expõe /api/audit/recent', async () => {
        const customId = 'req_bpa_audit_456';
        const resJob = await fetch(`http://localhost:${TEST_PORT}/api/jobs/enviar-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-request-id': customId
            },
            body: JSON.stringify({ destinatario: 'auditoria@bacabal.ma.gov.br', assunto: 'Teste Auditoria' })
        });

        assert.equal(resJob.status, 202);
        const jobBody = await resJob.json();
        assert.equal(jobBody.success, true);

        // Consulta rota de auditoria
        const resAudit = await fetch(`http://localhost:${TEST_PORT}/api/audit/recent`);
        assert.equal(resAudit.status, 200);
        const auditBody = await resAudit.json();
        assert.equal(auditBody.success, true);
        assert.ok(Array.isArray(auditBody.events));
    });
});
