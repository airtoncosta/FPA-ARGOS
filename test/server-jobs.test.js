const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('Server Background Jobs API Integration', () => {
    const TEST_PORT = 3897;
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

        assert.equal(res.status, 202, 'Deverá responder HTTP 202 Accepted');
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.status, 'QUEUED');
        assert.ok(body.jobId, 'Deve conter jobId');
        assert.ok(body.checkUrl, 'Deve conter URL de consulta checkUrl');

        // Checa status via GET /api/jobs/:id
        const resStatus = await fetch(`http://localhost:${TEST_PORT}/api/jobs/${body.jobId}`);
        assert.equal(resStatus.status, 200);
        const bodyStatus = await resStatus.json();
        assert.equal(bodyStatus.success, true);
        assert.ok(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'].includes(bodyStatus.job.status));
        assert.equal(bodyStatus.job.id, body.jobId);
    });

    test('GET /api/jobs retorna listagem de jobs com status 200', async () => {
        const res = await fetch(`http://localhost:${TEST_PORT}/api/jobs`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.ok(Array.isArray(body.jobs));
        assert.ok(body.jobs.length >= 1);
    });

    test('GET /api/jobs/job_inexistente retorna HTTP 404', async () => {
        const res = await fetch(`http://localhost:${TEST_PORT}/api/jobs/job_inexistente_999`);
        assert.equal(res.status, 404);
        const body = await res.json();
        assert.equal(body.success, false);
    });
});
