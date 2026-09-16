const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('Server HTTP Compression Integration', () => {
    const TEST_PORT = 3895;
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

    test('comprime arquivos estáticos JS/CSS quando cliente solicita gzip', async () => {
        const res = await fetch(`http://localhost:${TEST_PORT}/css/style.css`, {
            headers: { 'Accept-Encoding': 'gzip' }
        });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-encoding'), 'gzip', 'Deve retornar header Content-Encoding: gzip');
        assert.match(res.headers.get('vary') || '', /Accept-Encoding/i);

        // Fetch do Node.js descomprime o corpo de forma transparente
        const text = await res.text();
        assert.ok(text.length > 500);
    });

    test('comprime respostas de API JSON quando cliente solicita gzip', async () => {
        // Enfileira um job com dados suficientes para exceder o limiar mínimo de compressão (1KB)
        await fetch(`http://localhost:${TEST_PORT}/api/jobs/enviar-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destinatario: 'auditoria@bacabal.ma.gov.br',
                assunto: 'Relatório Mensal de Produção BPA',
                corpoTexto: 'Registro de auditoria médica detalhada com múltiplos caracteres para atingir o limiar de compressão. '.repeat(15)
            })
        });

        const res = await fetch(`http://localhost:${TEST_PORT}/api/jobs`, {
            headers: { 'Accept-Encoding': 'gzip' }
        });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-encoding'), 'gzip', 'Deve retornar header Content-Encoding: gzip');

        const json = await res.json();
        assert.equal(json.success, true);
        assert.ok(Array.isArray(json.jobs));
        assert.ok(json.jobs.length >= 1);
    });

    test('não comprime respostas se o cliente não enviar Accept-Encoding gzip/deflate', async () => {
        const res = await fetch(`http://localhost:${TEST_PORT}/css/style.css`, {
            headers: { 'Accept-Encoding': 'identity' }
        });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-encoding'), null);
    });
});
