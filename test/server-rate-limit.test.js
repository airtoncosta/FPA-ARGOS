const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('Server Rate Limiting Integration', () => {
    const TEST_PORT = 3899;
    let serverInstance;
    let globalRateLimiter;

    before((t, done) => {
        process.env.PORT = String(TEST_PORT);
        const mod = require('../server.js');
        serverInstance = mod.server;
        globalRateLimiter = mod.globalRateLimiter;
        setTimeout(done, 500);
    });

    after((t, done) => {
        if (serverInstance && serverInstance.close) {
            serverInstance.close(done);
        } else {
            done();
        }
    });

    test('permite requisições e inclui headers RateLimit-* em rota de consulta', async () => {
        const res = await fetch(`http://localhost:${TEST_PORT}/api/bpa/email-config`);
        assert.equal(res.status, 200);
        assert.ok(res.headers.has('ratelimit-limit'), 'deve conter header ratelimit-limit');
        assert.ok(res.headers.has('ratelimit-remaining'), 'deve conter header ratelimit-remaining');
        assert.ok(res.headers.has('ratelimit-reset'), 'deve conter header ratelimit-reset');
    });

    test('bloqueia requisição quando limite de tier é atingido e retorna HTTP 429 com Retry-After', async () => {
        // Pré-preenche o bucket de email para 127.0.0.1 com 5 chamadas
        for (let i = 0; i < 5; i++) {
            globalRateLimiter.check('email:127.0.0.1', 5, 60000);
        }

        // A próxima requisição HTTP para a rota de e-mail deve ser rejeitada na borda
        const res = await fetch(`http://localhost:${TEST_PORT}/api/bpa/testar-conexao-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinatario: 'teste@exemplo.com' })
        });

        assert.equal(res.status, 429, 'Requisição além do limite deve receber HTTP 429');
        assert.ok(res.headers.has('retry-after'), 'deve conter header retry-after');

        const body = await res.json();
        assert.equal(body.code, 'RATE_LIMIT_EXCEEDED');
        assert.equal(body.category, 'email');
        assert.ok(body.retryAfterSeconds > 0);
    });
});
